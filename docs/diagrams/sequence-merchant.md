# Sequence Diagram — Merchant

Covers: merchant registration (pending approval), issuing an **API key**, configuring a
webhook URL, **creating a delivery order through the merchant API**, the merchant
dashboard, and **webhook delivery with retry**.

← [Back to diagram index](README.md)

```mermaid
sequenceDiagram
    autonumber
    actor Merchant
    participant Store as Merchant E-commerce System
    participant API as Backend API
    participant DB as Database
    participant Worker as Webhook Worker

    opt Merchant registration
        Merchant->>API: Submit merchant registration
        API->>API: Validate registration details
        API->>DB: Save merchant with Pending approval status
        DB-->>API: Registration saved
        API-->>Merchant: Await administrator approval
        Note over Merchant,DB: Admin approval is shown in the dispatcher/admin diagram
    end

    opt Obtain API access after approval
        Merchant->>API: Request API key while authenticated
        API->>DB: Check merchant approval status
        DB-->>API: Approved merchant
        API->>API: Generate API key
        API->>DB: Store API key hash
        API-->>Merchant: Reveal API key once
        Merchant->>Store: Configure API key securely
    end

    opt Configure webhook endpoint
        Merchant->>API: Register webhook URL while authenticated
        API->>API: Validate merchant ownership and webhook URL
        API->>DB: Save webhook configuration
        API-->>Merchant: Webhook configured
    end

    rect rgba(59, 130, 246, 0.10)
        Note over Store,DB: Create delivery through the merchant API
        Store->>API: POST delivery order with API key
        API->>DB: Verify API key and merchant approval
        DB-->>API: Authentication and approval result

        alt Invalid key or unapproved merchant
            API-->>Store: Reject request with 401 or 403
        else Authorized merchant
            API->>API: Validate order details

            alt Invalid order data
                API-->>Store: Return validation errors
            else Valid order
                API->>DB: Read applicable pricing
                DB-->>API: Pricing rules
                API->>API: Calculate delivery fee
                API->>DB: Save merchant parcel and Created history
                DB-->>API: Parcel ID and tracking number
                API-->>Store: Return 201 Created and order details
                Store-->>Merchant: Display successful order
            end
        end
    end

    opt View merchant dashboard
        Merchant->>API: Request orders using application JWT
        API->>API: Verify merchant identity
        API->>DB: Read orders belonging to this merchant
        DB-->>API: Orders and delivery states
        API-->>Merchant: Display merchant dashboard
    end

    rect rgba(34, 197, 94, 0.10)
        Note over Worker: Consume merchant parcel status event from RabbitMQ
        Worker->>DB: Read webhook configuration
        DB-->>Worker: Endpoint and signing configuration
        Worker->>Store: POST signed status webhook with event ID

        alt Merchant endpoint accepts webhook
            Store-->>Worker: Return 2xx
            Worker->>DB: Record successful webhook delivery
        else Timeout or retryable error
            Store-->>Worker: Error response or no response
            Worker->>DB: Record failed attempt and next retry

            loop Until success or retry limit
                Worker->>Store: Retry webhook after backoff
                Store-->>Worker: Return delivery result
                Worker->>DB: Record attempt result
            end

            opt Retry limit reached without success
                Worker->>DB: Mark webhook delivery as exhausted
            end
        end
    end
```

**Blue block** = synchronous request/reply (merchant API).
**Green block** = asynchronous publish/subscribe (webhook worker).

## Design notes

| Step | Decision | Why |
|---|---|---|
| API key | Shown **once**, only a hash is stored | A database leak doesn't expose usable keys |
| API key | Sent in `X-API-Key` header over HTTPS | Keeps keys out of URLs and access logs |
| Order creation | `401` bad key, `403` not approved, `422` invalid body | Clear, standard errors with no internal details |
| Order creation | Optional `Idempotency-Key` header | A store that retries a timed-out request doesn't create duplicate parcels |
| Webhook | Signed with HMAC-SHA256 (`X-SwiftDrop-Signature`) + `X-SwiftDrop-Event-Id` | Merchant can verify it came from us and ignore duplicates |
| Webhook retry | Exponential backoff, max attempts from `WEBHOOK_MAX_ATTEMPTS`, then dead-letter | A merchant outage doesn't lose events or block other merchants |
| Webhook log | Every attempt stored | Visible in the merchant dashboard and useful in the demo |
