# Code signing policy

## Application status

As of 24 October 2026, cstmSKN is preparing an application to the
[SignPath Foundation](https://signpath.org/) for eligibility review. We have not
been accepted and do not currently use a SignPath certificate. Published Windows
builds are unsigned. No SignPath sponsorship, endorsement or signature is claimed.

The current Windows package includes a binary-only LeagueToolkit host and DLL
under the [LTK Patcher License](licenses/LTK-PATCHER-LICENSE.md). These components
are not built from public source in this repository and their custom license is
not an OSI-approved open-source license. Our reproducible preparation script
changes the DLL's expected launcher identity and strips upstream signatures as
required by its license. This is disclosed for SignPath's assessment; permission
to redistribute does not establish eligibility for Foundation signing.

The source-built application derives from MIT-licensed Zushi and includes GPL
LeagueToolkit source adaptations. See [LICENSE](LICENSE), the
[upstream GPL license](licenses/LTK-MANAGER-LICENSE.md), and the
[integration notice](licenses/LTK-INTEGRATION-NOTICE.md). The complete package
must not be represented as consisting exclusively of OSI-licensed source-built
components.

## Roles and proposed signing controls

The project maintainer, committer, reviewer and proposed release-signing approver
is [silentrosehill](https://github.com/silentrosehill). No other signing approvers
or organizations are currently designated.

If the application is accepted, signing will be configured only for artifacts
and components expressly approved by SignPath. The intended process uses
GitHub Actions builds tied to a public source revision, verified artifact origin,
consistent product/version metadata, and manual approval by the maintainer for
each release. Multi-factor authentication will be required for signing access.
No signing service, credential or automatic signing approval is active today.
The binary-only engine is not assumed eligible for signing under this proposal.

## Privacy information

The public application code implements no maintainer-operated account service,
advertising, analytics or telemetry upload. Preferences, imported mods, downloaded
files, loadouts and patcher diagnostics are stored locally. Diagnostics may
contain local paths and should be reviewed before a user chooses to share them.

The app makes network requests for its functions: catalogs, artwork and skin
downloads, current-patch information, GitHub release notes and update checks.
These contact GitHub, Riot's Data Dragon and CommunityDragon services, which can
receive the requesting device's IP address and requested resource information.
Users are subject to those services' own privacy practices. The champion-select
integration communicates with the local Riot client on loopback; its local API
credentials are not intentionally sent to an external service by our code.

This description covers the public cstmSKN application code. The separately
licensed binary-only engine cannot be fully audited from this repository, so
this document does not claim an independent review of all its behavior. Users
may share issues or diagnostics through GitHub at their discretion.
