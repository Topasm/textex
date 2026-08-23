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
