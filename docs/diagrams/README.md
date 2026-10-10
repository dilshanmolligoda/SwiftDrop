# Diagrams

All diagrams are written in [Mermaid](https://mermaid.js.org/) inside Markdown, so they
render directly on GitHub, live in version control, and show up in PR diffs.

| Diagram | File | Assignment requirement |
|---|---|---|
| Use case — overview + one per actor | [use-case.md](use-case.md) | Use case diagrams for customer, merchant, courier, dispatcher |
| Sequence — Customer | [sequence-customer.md](sequence-customer.md) | Creating a delivery · OAuth 2.0 login flow |
| Sequence — Merchant | [sequence-merchant.md](sequence-merchant.md) | Merchant API order creation · webhooks with retry |
| Sequence — Courier | [sequence-courier.md](sequence-courier.md) | Courier status update triggering notifications |
| Sequence — Dispatcher / Admin | [sequence-dispatcher.md](sequence-dispatcher.md) | Assignment, approval, management, reports |
| System context, containers, layers, integration, deployment | [../../ARCHITECTURE.md](../../ARCHITECTURE.md) | Architecture proposal · integration design |
| ER diagram | `er-diagram.md` *(to be added)* | ER diagram |

## Editing a diagram

1. Copy the code block into <https://mermaid.live> and edit with live preview.
2. Paste it back into the `.md` file.
3. Open a PR — reviewers see the rendered diagram in GitHub's "Rich diff" view.

## Exported images (for the design PDF)

High-resolution PNGs of every diagram are in [`export/`](export/), numbered in the order
they should appear in the design document:

| # | File | # | File |
|---|---|---|---|
| 01 | `01-use-case-overview.png` | 09 | `09-parcel-status-state-machine.png` |
| 02 | `02-use-case-customer.png` | 10 | `10-sequence-dispatcher-admin.png` |
| 03 | `03-use-case-merchant.png` | 11 | `11-system-context.png` |
| 04 | `04-use-case-courier.png` | 12 | `12-containers.png` |
| 05 | `05-use-case-dispatcher-admin.png` | 13 | `13-layers.png` |
| 06 | `06-sequence-customer.png` | 14 | `14-rabbitmq-topology.png` |
| 07 | `07-sequence-merchant.png` | 15 | `15-kubernetes-deployment.png` |
| 08 | `08-sequence-courier.png` | 16 | `16-ai-assistant.png` |

**The `.md` files are the source of truth.** After changing a diagram, re-export it:

```bash
# exports every Mermaid block in the file as name-1.png, name-2.png, …
npx -y @mermaid-js/mermaid-cli -i docs/diagrams/use-case.md -o docs/diagrams/export/use-case.png -b white -s 2
```

Then rename the output to match the numbered file above.
