# Sequence Diagram — Courier

Covers: courier login, today's assigned deliveries, **status update with proof**, failed
delivery with reason, and how one status update **triggers notifications and merchant
webhooks** through RabbitMQ using the transactional outbox.

← [Back to diagram index](README.md)

```mermaid
sequenceDiagram
    autonumber
    actor Courier
    participant API as Backend API
    participant DB as Database
    participant Broker as RabbitMQ
    participant Workers as Notification and Webhook Workers

    Courier->>API: Log in with credentials
    API->>DB: Find courier account
    DB-->>API: Courier account and password hash
    API->>API: Verify password and courier role
    API-->>Courier: Return JWT on success

    Courier->>API: Request today's assigned deliveries with JWT
    API->>API: Authenticate courier
    API->>DB: Find deliveries assigned to this courier today
    DB-->>API: Assigned delivery list
    API-->>Courier: Display deliveries

    Courier->>API: Submit parcel status and delivery note or proof
    API->>DB: Read parcel and courier assignment
    DB-->>API: Current status and assigned courier

    alt Parcel belongs to another courier
        API-->>Courier: Return 403 Forbidden
    else Courier owns assignment
        API->>API: Validate requested status transition and input

        alt Invalid transition or missing required data
            API-->>Courier: Return validation error
        else Valid status update
            opt Requested status is Failed
                API->>API: Require a failure reason
            end

            API->>DB: Begin transaction
            API->>DB: Update status and save note or proof
            API->>DB: Append status history and outbox event
            API->>DB: Commit transaction
            DB-->>API: Update committed
            API-->>Courier: Confirm successful update

            Note over API,Broker: Background outbox publisher delivers committed events
            API-)Broker: Publish ParcelStatusChanged event
            Broker-->>API: Confirm publication
            API->>DB: Mark outbox event as published

            par Notification processing
                Broker-)Workers: Deliver event to notification queue consumer
                Workers->>Workers: Check event ID to prevent duplicates
                Workers->>Workers: Send email or mock SMS notification
                Workers->>DB: Record notification result
                Workers-->>Broker: Acknowledge processed notification event
            and Merchant webhook processing
                Broker-)Workers: Deliver event to webhook queue consumer
                alt Parcel belongs to a merchant
                    Workers->>Workers: Send merchant webhook with retry handling
                    Note over Workers: Detailed webhook flow is in the merchant diagram
                else Customer parcel
                    Workers->>Workers: No merchant webhook required
                end
                Workers-->>Broker: Acknowledge handled webhook event
            end

            Note over API: Push committed status updates to subscribed tracking clients
        end
    end
```

## Allowed status transitions

The API rejects any update that is not in this state machine (step "Validate requested
status transition"). *Proposed — the parcels module owner confirms the final rules.*

```mermaid
stateDiagram-v2
    direction LR
    [*] --> Created
    Created --> PickedUp: courier collects
    PickedUp --> InTransit
    InTransit --> OutForDelivery
    OutForDelivery --> Delivered: proof recorded
    OutForDelivery --> Failed: reason required
    PickedUp --> Failed: reason required
    InTransit --> Failed: reason required
    Delivered --> [*]
    Failed --> [*]
```

## Design notes

| Step | Decision | Why |
|---|---|---|
| Ownership check | `403` if the parcel is assigned to a different courier | Assignment requirement: "a courier cannot access another courier's deliveries" — covered by a test |
| Transaction | Status, history row and outbox event saved in **one** DB transaction | The event is never lost and never sent for an update that rolled back |
| Outbox publisher | Background job publishes and marks rows as published | Decouples the HTTP request from broker availability |
| Two queues | Notification and webhook consumers get their own copy of the event | A failing webhook can't delay customer notifications |
| Idempotency | Consumers skip event IDs they have already processed | RabbitMQ is at-least-once; duplicates must be harmless |
| Proof upload | Image type/size validated; stored outside the DB; path saved | Keeps the DB small; prevents uploading arbitrary files |
