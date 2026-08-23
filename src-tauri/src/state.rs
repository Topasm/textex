use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex, MutexGuard, RwLock, RwLockReadGuard, RwLockWriteGuard,
    },
};

use tokio::sync::{
    oneshot, Notify, RwLock as AsyncRwLock, RwLockReadGuard as AsyncRwLockReadGuard,
    RwLockWriteGuard as AsyncRwLockWriteGuard,
};

use crate::{
    error::{AppError, AppResult},
    models::{CompilePriority, CompileRequest},
};

pub struct AppState {
    project_root: RwLock<Option<PathBuf>>,
    project_epoch: Arc<AtomicU64>,
    project_transition: AsyncRwLock<()>,
    selected_project_roots: Mutex<Vec<PathBuf>>,
    compiler: Mutex<CompilerRuntime>,
    compiler_changed: Notify,
    next_compilation_id: AtomicU64,
}

#[derive(Default)]
struct CompilerRuntime {
    active: Option<ActiveCompilation>,
    pending: Vec<PendingCompilation>,
    latest_request_by_document: HashMap<String, u64>,
}

struct ActiveCompilation {
    id: u64,
    request_id: u64,
    document_id: String,
    priority: CompilePriority,
    cancel: Option<oneshot::Sender<()>>,
}

struct PendingCompilation {
    id: u64,
    request_id: u64,
    document_id: String,
    priority: CompilePriority,
}

pub(crate) struct CompilationLease<'a> {
    state: &'a AppState,
    id: u64,
    cancel_receiver: oneshot::Receiver<()>,
}

struct PendingRegistration<'a> {
    state: &'a AppState,
    id: u64,
    armed: bool,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            project_root: RwLock::new(None),
            project_epoch: Arc::new(AtomicU64::new(0)),
            project_transition: AsyncRwLock::new(()),
            selected_project_roots: Mutex::new(Vec::new()),
            compiler: Mutex::new(CompilerRuntime::default()),
            compiler_changed: Notify::new(),
            next_compilation_id: AtomicU64::new(0),
        }
    }
}

impl AppState {
    pub fn set_project_root(&self, root: PathBuf) -> AppResult<()> {
        let mut root_guard = self.write_root()?;
        *root_guard = Some(root);
        self.project_epoch.fetch_add(1, Ordering::Release);
        drop(root_guard);
        Ok(())
    }

    /// Clears the trusted project root and advances the epoch so in-flight
    /// filesystem, watcher, index, and compile work can no longer publish
    /// results for the closed project. The returned epoch belongs to the
    /// project that was active before the close.
    pub fn clear_project_root(&self) -> AppResult<Option<(PathBuf, u64)>> {
        let mut root_guard = self.write_root()?;
        let project_epoch = self.project_epoch.load(Ordering::Acquire);
        let root = root_guard.take();
        self.project_epoch.fetch_add(1, Ordering::Release);
        drop(root_guard);
        Ok(root.map(|root| (root, project_epoch)))
    }

    pub fn project_root(&self) -> AppResult<PathBuf> {
        self.read_root()?.clone().ok_or(AppError::ProjectNotOpen)
    }

    pub(crate) fn project_root_epoch(&self) -> AppResult<(PathBuf, u64, Arc<AtomicU64>)> {
        let root_guard = self.read_root()?;
        let root = root_guard.clone().ok_or(AppError::ProjectNotOpen)?;
        let epoch = self.project_epoch.load(Ordering::Acquire);
        drop(root_guard);
        Ok((root, epoch, Arc::clone(&self.project_epoch)))
    }

    pub(crate) async fn lock_project_transition(&self) -> AsyncRwLockWriteGuard<'_, ()> {
        self.project_transition.write().await
    }

    pub(crate) async fn lock_project_operation(&self) -> AsyncRwLockReadGuard<'_, ()> {
        self.project_transition.read().await
    }

    pub(crate) fn grant_project_selection(&self, root: PathBuf) -> AppResult<()> {
        const MAX_SELECTION_GRANTS: usize = 16;

        let mut grants = self
            .selected_project_roots
            .lock()
            .map_err(|_| AppError::StatePoisoned)?;
        grants.retain(|granted| !project_paths_equal(granted, &root));
        grants.push(root);
        if grants.len() > MAX_SELECTION_GRANTS {
            let overflow = grants.len() - MAX_SELECTION_GRANTS;
            grants.drain(..overflow);
        }
        Ok(())
    }

    pub(crate) fn consume_project_selection(&self, root: &Path) -> AppResult<bool> {
        let mut grants = self
            .selected_project_roots
            .lock()
            .map_err(|_| AppError::StatePoisoned)?;
        let Some(index) = grants
            .iter()
            .position(|granted| project_paths_equal(granted, root))
        else {
            return Ok(false);
        };
        grants.swap_remove(index);
        Ok(true)
    }

    pub(crate) fn current_project_epoch(&self) -> u64 {
        self.project_epoch.load(Ordering::Acquire)
    }

    pub(crate) async fn begin_compilation(
        &self,
        request: &CompileRequest,
        expected_project_epoch: u64,
    ) -> AppResult<CompilationLease<'_>> {
        let id = self.next_compilation_id.fetch_add(1, Ordering::Relaxed) + 1;
        let pending = PendingCompilation {
            id,
            request_id: request.request_id,
            document_id: request.document_id.clone(),
            priority: request.priority,
        };
        let cancel_active = {
            let mut compiler = self.lock_compiler()?;
            if self.current_project_epoch() != expected_project_epoch {
                return Err(AppError::CompilationCancelled);
            }
            if compiler
                .latest_request_by_document
                .get(&pending.document_id)
                .is_some_and(|latest| *latest >= pending.request_id)
            {
                return Err(AppError::CompilationSuperseded);
            }

            compiler
                .latest_request_by_document
                .insert(pending.document_id.clone(), pending.request_id);
            compiler.pending.retain(|queued| {
                queued.document_id != pending.document_id || queued.request_id >= pending.request_id
            });

            let should_preempt = compiler
                .active
                .as_ref()
                .is_some_and(|active| should_preempt(active, &pending));
            let cancel_active = should_preempt
                .then(|| {
                    compiler
                        .active
                        .as_mut()
                        .and_then(|active| active.cancel.take())
                })
                .flatten();
            compiler.pending.push(pending);
            cancel_active
        };

        if let Some(cancel) = cancel_active {
            // The compile owner performs the actual child kill and reap. The
            // state lock is deliberately released before waking that task.
            let _ = cancel.send(());
        }
        self.compiler_changed.notify_waiters();

        let mut registration = PendingRegistration {
            state: self,
            id,
            armed: true,
        };

        loop {
            // Register before checking shared state so a completion between
            // the check and await cannot be lost.
            let changed = self.compiler_changed.notified();
            tokio::pin!(changed);
            changed.as_mut().enable();

            let lease = {
                let mut compiler = self.lock_compiler()?;
                if self.current_project_epoch() != expected_project_epoch {
                    return Err(AppError::CompilationCancelled);
                }
                let Some(queued_index) = compiler.pending.iter().position(|queued| queued.id == id)
                else {
                    return Err(AppError::CompilationSuperseded);
                };

                let may_start = compiler.active.is_none()
                    && next_pending_index(&compiler.pending) == Some(queued_index);
                if may_start {
                    let queued = compiler.pending.remove(queued_index);
                    let (cancel, cancel_receiver) = oneshot::channel();
                    compiler.active = Some(ActiveCompilation {
                        id,
                        request_id: queued.request_id,
                        document_id: queued.document_id,
                        priority: queued.priority,
                        cancel: Some(cancel),
                    });
                    Some(CompilationLease {
                        state: self,
                        id,
                        cancel_receiver,
                    })
                } else {
                    None
                }
            };

            if let Some(lease) = lease {
                registration.armed = false;
                return Ok(lease);
            }

            changed.await;
        }
    }

    pub(crate) fn cancel_compilation(&self) -> AppResult<bool> {
        let mut compiler = self.lock_compiler()?;
        let Some(compilation) = compiler.active.as_mut() else {
            return Ok(false);
        };
        let Some(cancel) = compilation.cancel.take() else {
            return Ok(false);
        };

        // The receiver owns the child and performs the actual kill and reap;
        // no process handle is ever held while a shared mutex is locked.
        Ok(cancel.send(()).is_ok())
    }

    pub(crate) fn cancel_project_compilations(&self) -> AppResult<bool> {
        let cancel = {
            let mut compiler = self.lock_compiler()?;
            compiler.pending.clear();
            compiler.latest_request_by_document.clear();
            compiler
                .active
                .as_mut()
                .and_then(|compilation| compilation.cancel.take())
        };
        self.compiler_changed.notify_waiters();

        // The active compile task owns its child process and reaps it after the
        // cancellation signal. Pending waiters observe their removed entries
        // and terminate without starting work for the closed project.
        Ok(cancel.is_some_and(|cancel| cancel.send(()).is_ok()))
    }

    fn read_root(&self) -> AppResult<RwLockReadGuard<'_, Option<PathBuf>>> {
        self.project_root
            .read()
            .map_err(|_| AppError::StatePoisoned)
    }

    fn write_root(&self) -> AppResult<RwLockWriteGuard<'_, Option<PathBuf>>> {
        self.project_root
            .write()
            .map_err(|_| AppError::StatePoisoned)
    }

    fn lock_compiler(&self) -> AppResult<MutexGuard<'_, CompilerRuntime>> {
        self.compiler.lock().map_err(|_| AppError::StatePoisoned)
    }

    fn finish_compilation(&self, id: u64) {
        if let Ok(mut compiler) = self.compiler.lock() {
            if compiler
                .active
                .as_ref()
                .is_some_and(|compilation| compilation.id == id)
            {
                compiler.active = None;
            }
        }
        self.compiler_changed.notify_waiters();
    }

    fn remove_pending_compilation(&self, id: u64) {
        if let Ok(mut compiler) = self.compiler.lock() {
            compiler.pending.retain(|pending| pending.id != id);
        }
        self.compiler_changed.notify_waiters();
    }
}

fn project_paths_equal(left: &Path, right: &Path) -> bool {
    if cfg!(windows) {
        left.to_string_lossy()
            .eq_ignore_ascii_case(&right.to_string_lossy())
    } else {
        left == right
    }
}

fn should_preempt(active: &ActiveCompilation, pending: &PendingCompilation) -> bool {
    if active.priority == CompilePriority::Background
        && pending.priority != CompilePriority::Background
    {
        return true;
    }
    if pending.priority == CompilePriority::High && active.priority != CompilePriority::High {
        return true;
    }

    pending.priority != CompilePriority::Background
        && pending.document_id == active.document_id
        && pending.request_id > active.request_id
}

fn next_pending_index(pending: &[PendingCompilation]) -> Option<usize> {
    pending
        .iter()
        .enumerate()
        .min_by_key(|(_, queued)| (priority_rank(queued.priority), queued.id))
        .map(|(index, _)| index)
}

const fn priority_rank(priority: CompilePriority) -> u8 {
    match priority {
        CompilePriority::High => 0,
        CompilePriority::Normal => 1,
        CompilePriority::Background => 2,
    }
}

impl CompilationLease<'_> {
    pub(crate) fn cancel_receiver(&mut self) -> &mut oneshot::Receiver<()> {
        &mut self.cancel_receiver
    }
}

impl Drop for CompilationLease<'_> {
    fn drop(&mut self) {
        self.state.finish_compilation(self.id);
    }
}

impl Drop for PendingRegistration<'_> {
    fn drop(&mut self) {
        if self.armed {
            self.state.remove_pending_compilation(self.id);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{
        path::PathBuf,
        sync::{atomic::Ordering, Arc},
    };

    use super::AppState;
    use crate::{
        error::AppError,
        models::{CompilePriority, CompileRequest},
    };
    use tokio::time::{timeout, Duration};

    fn request(request_id: u64, document_id: &str, priority: CompilePriority) -> CompileRequest {
        CompileRequest {
            request_id,
            document_id: document_id.to_owned(),
            document_revision: request_id,
            file_path: "/project/main.tex".to_owned(),
            priority,
        }
    }

    #[test]
    fn clearing_a_project_invalidates_its_epoch_and_root() {
        let state = AppState::default();
        let root = PathBuf::from("/project");
        state
            .set_project_root(root.clone())
            .expect("activate project");
        let (_, active_epoch, epoch_tracker) =
            state.project_root_epoch().expect("active project epoch");

        assert_eq!(
            state.clear_project_root().expect("clear project"),
            Some((root, active_epoch))
        );
        assert!(matches!(
            state.project_root(),
            Err(AppError::ProjectNotOpen)
        ));
        assert!(epoch_tracker.load(Ordering::Acquire) > active_epoch);
    }

    #[tokio::test]
    async fn project_transition_waits_for_project_operations() {
        let state = Arc::new(AppState::default());
        let operation = state.lock_project_operation().await;
        let transition_state = Arc::clone(&state);
        let mut transition = tokio::spawn(async move {
            let _transition = transition_state.lock_project_transition().await;
        });

        assert!(timeout(Duration::from_millis(20), &mut transition)
            .await
            .is_err());
        drop(operation);
        timeout(Duration::from_millis(100), transition)
            .await
            .expect("transition should continue after the operation")
            .expect("transition task should succeed");
    }

    #[test]
    fn project_selection_grants_are_consumed_once() {
        let state = AppState::default();
        let root = PathBuf::from("/selected-project");
        state
            .grant_project_selection(root.clone())
            .expect("grant selected project");

        assert!(state
            .consume_project_selection(&root)
            .expect("consume selected project"));
        assert!(!state
            .consume_project_selection(&root)
            .expect("selection grant must not be reusable"));
    }

    #[tokio::test]
    async fn newer_revision_preempts_the_active_compile() {
        let state = AppState::default();
        let first_request = request(1, "document-a", CompilePriority::Normal);
        let second_request = request(2, "document-a", CompilePriority::Normal);
        let epoch = state.current_project_epoch();
        let mut first = state
            .begin_compilation(&first_request, epoch)
            .await
            .expect("first lease");
        let second = state.begin_compilation(&second_request, epoch);
        tokio::pin!(second);

        assert!(timeout(Duration::from_millis(20), &mut second)
            .await
            .is_err());
        assert!(first.cancel_receiver().try_recv().is_ok());

        drop(first);
        timeout(Duration::from_millis(100), &mut second)
            .await
            .expect("newer request should start")
            .expect("newer request lease");
    }

    #[tokio::test]
    async fn cancellation_is_delivered_only_once() {
        let state = AppState::default();
        let compile_request = request(1, "document-a", CompilePriority::Normal);
        let epoch = state.current_project_epoch();
        let mut lease = state
            .begin_compilation(&compile_request, epoch)
            .await
            .expect("lease");
        assert!(state.cancel_compilation().expect("first cancellation"));
        assert!(!state.cancel_compilation().expect("second cancellation"));
        assert!(lease.cancel_receiver().try_recv().is_ok());
    }

    #[tokio::test]
    async fn pending_compiles_run_in_priority_order() {
        let state = AppState::default();
        let active_request = request(1, "document-a", CompilePriority::High);
        let background_request = request(2, "document-b", CompilePriority::Background);
        let normal_request = request(3, "document-c", CompilePriority::Normal);
        let epoch = state.current_project_epoch();
        let active = state
            .begin_compilation(&active_request, epoch)
            .await
            .expect("active lease");
        let background = state.begin_compilation(&background_request, epoch);
        let normal = state.begin_compilation(&normal_request, epoch);
        tokio::pin!(background, normal);

        assert!(timeout(Duration::from_millis(20), &mut background)
            .await
            .is_err());
        assert!(timeout(Duration::from_millis(20), &mut normal)
            .await
            .is_err());
        drop(active);

        let normal_lease = timeout(Duration::from_millis(100), &mut normal)
            .await
            .expect("normal request should start first")
            .expect("normal lease");
        drop(normal_lease);
        timeout(Duration::from_millis(100), &mut background)
            .await
            .expect("background request should start second")
            .expect("background lease");
    }

    #[tokio::test]
    async fn newer_pending_revision_supersedes_the_older_one() {
        let state = AppState::default();
        let active_request = request(1, "document-a", CompilePriority::High);
        let old_request = request(2, "document-b", CompilePriority::Normal);
        let new_request = request(3, "document-b", CompilePriority::Normal);
        let epoch = state.current_project_epoch();
        let active = state
            .begin_compilation(&active_request, epoch)
            .await
            .expect("active lease");
        let old = state.begin_compilation(&old_request, epoch);
        let new = state.begin_compilation(&new_request, epoch);
        tokio::pin!(old, new);

        assert!(timeout(Duration::from_millis(20), &mut old).await.is_err());
        assert!(timeout(Duration::from_millis(20), &mut new).await.is_err());
        assert!(matches!(
            timeout(Duration::from_millis(100), &mut old)
                .await
                .expect("old request should be woken"),
            Err(AppError::CompilationSuperseded)
        ));

        drop(active);
        timeout(Duration::from_millis(100), &mut new)
            .await
            .expect("new request should start")
            .expect("new lease");
    }

    #[tokio::test]
    async fn project_close_cancels_active_and_pending_compiles_for_the_old_epoch() {
        let state = AppState::default();
        state
            .set_project_root(PathBuf::from("/project-a"))
            .expect("activate first project");
        let epoch = state.current_project_epoch();
        let active_request = request(1, "document-a", CompilePriority::High);
        let pending_request = request(1, "document-b", CompilePriority::Normal);
        let late_request = request(1, "document-c", CompilePriority::Normal);
        let mut active = state
            .begin_compilation(&active_request, epoch)
            .await
            .expect("active lease");
        let pending = state.begin_compilation(&pending_request, epoch);
        tokio::pin!(pending);
        assert!(timeout(Duration::from_millis(20), &mut pending)
            .await
            .is_err());

        state.clear_project_root().expect("clear first project");
        assert!(state
            .cancel_project_compilations()
            .expect("cancel first project compiles"));
        assert!(active.cancel_receiver().try_recv().is_ok());
        assert!(matches!(
            timeout(Duration::from_millis(100), &mut pending)
                .await
                .expect("pending compile should wake"),
            Err(AppError::CompilationSuperseded)
        ));
        assert!(matches!(
            state.begin_compilation(&late_request, epoch).await,
            Err(AppError::CompilationCancelled)
        ));

        drop(active);
        state
            .set_project_root(PathBuf::from("/project-b"))
            .expect("activate second project");
        state
            .begin_compilation(&active_request, state.current_project_epoch())
            .await
            .expect("request ids reset with the project session");
    }
}
