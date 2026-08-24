# Research Profile

Each TextEx project can attach paper metadata and research resources to the
active project. The versioned profile is stored at
`.textex/research-profile.json`.

## Profile contents

- Paper title, abstract, DOI, arXiv ID, venue, website, and authors
- Git repositories, websites, datasets, and documentation
- Per-resource Chat access (`none`, `metadata`, `indexed-read`, or `snapshot`)
- User-authored project instructions

The profile may contain repository URLs and local paths, but it must never
contain passwords, access tokens, SSH private keys, or other credentials. SSH
operations use the user's existing SSH agent and are never initiated merely by
opening a project.

## Trust model

Project instructions and reference content are deliberately separate. Only
instructions entered by the user are treated as instructions. Repository
files, READMEs, paper text, and downloaded webpages are untrusted reference
material and cannot elevate their contents into system instructions.

Local repository access is read-only and requires both an active project and a
resource whose Chat access permits indexing. Indexing excludes VCS metadata,
dependency/build directories, environment and credential-like files, binary
files, and oversized inputs. Results are bounded and retain file and line
provenance so Chat answers can identify their source.

## Renderer/native boundary

The renderer loads and saves profiles and requests source indexing through the
typed desktop API. It does not read the filesystem, invoke Git, or access SSH
directly. Native commands validate the active project session, profile IDs,
paths, limits, and serialized data before accessing project resources.

## Research Chat sessions and references

Research Chat history and selected context metadata are stored per project in
`.textex/research-chat.json`. The file is written atomically and is bounded in
message count and size. It stores reference identities and display metadata,
not resolved project bibliography entries, Zotero records, repository file
contents, or website snapshots.

Session mutations carry the native project activation epoch and a monotonic
file revision. The backend compares both while holding the project-operation
lock, so a delayed save from a closed project—or from an earlier activation of
the same path—cannot overwrite the active project's Chat history.

References can be dragged from Project, Zotero, or Online results onto the Chat
tab or into the Chat composer. Each reference card also exposes an **Add to
Chat** action for keyboard and touch use. The panel switches tabs only after a
valid drop, then attaches the reference after that project's saved Chat session
has loaded. Project and Zotero references cross the renderer/native boundary as
citekeys and are resolved again by the native backend. Online reference
metadata is validated by the native backend before it becomes Chat context.
Assistant cards describe the references attached to that request and can add a
citation at the active editor cursor; online cards can also save the item to
Zotero.

## Zotero changes from Chat

Research Chat recognizes explicit Zotero mutation requests and routes them to
a separate approval workflow. Supported changes are collection creation,
collection moves, collection renames, and item tag additions/removals. The AI
provider produces only a draft; native code resolves collection paths and item
queries against the current Local API library and returns a concrete preview.
Nothing is written until the user selects **Approve in Zotero**.

Paper classification is handled separately from moving a collection in the
hierarchy. An `updateItemCollections` draft adds or removes matching papers via
their item `collections` membership. Tag and collection changes targeting the
same paper are combined into one versioned item update, so unrelated tags and
collection memberships are preserved and the operation cannot conflict with
itself. Nested collection paths are resolved exactly; ambiguous short names
are rejected.

Approved plans are bounded to 25 objects, tied to the active project epoch and
Zotero server ID, and revalidated against current object versions immediately
before writing. Stale, ambiguous, cyclic, destructive, or unsupported plans
are rejected. The Zotero Local API key is obtained by the Rust backend at
runtime and is never returned to the renderer or sent to the AI provider.
One-time and remembered authorization follow Zotero's own Allow/Always Allow
choice. Collection and item-tag batches use separate Local API endpoints, so a
mixed plan may require two one-time authorization prompts.
