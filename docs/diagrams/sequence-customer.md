# Sequence Diagram — Customer

Covers: registration, email/password login, **Login with Google (OAuth 2.0 + PKCE)**,
**creating a delivery** with fee estimate, live tracking over **SSE**, public tracking,
delivery history and receipt download.

← [Back to diagram index](README.md)

```mermaid
sequenceDiagram
    autonumber
    actor Customer
    participant UI as Web Application
    participant API as Backend API
    participant DB as Database
    participant Google as Google Identity Provider

    opt New customer registration
        Customer->>UI: Enter registration details
        UI->>API: Submit registration
        API->>API: Validate input and hash password
        API->>DB: Save customer account
        DB-->>API: Account created
        API-->>UI: Registration successful
        UI-->>Customer: Show login page
    end

    alt Email and password login
        Customer->>UI: Enter email and password
        UI->>API: Submit login
        API->>DB: Find customer account
        DB-->>API: Account and password hash
        API->>API: Verify password
        API-->>UI: Return application JWT on success
    else Google login
        Customer->>UI: Select Login with Google
        UI->>API: Start Google login
        API-->>UI: Redirect to Google with state and PKCE
        UI->>Google: Open authorization page
        Google-->>Customer: Request authentication and consent
        Customer->>Google: Authenticate and consent
        Google-->>API: Redirect callback with authorization code
        API->>API: Validate state
        API->>Google: Exchange code using PKCE verifier
        Google-->>API: Return tokens
        API->>API: Validate Google identity token
        API->>DB: Find or create customer account
        DB-->>API: Customer account
        API-->>UI: Establish application JWT session
    end

    opt Create delivery
        Customer->>UI: Enter pickup, destination, size and weight
        UI->>API: Request delivery fee estimate
        API->>DB: Read applicable zones and pricing
        DB-->>API: Pricing rules
        API->>API: Calculate estimated fee
        API-->>UI: Return fee estimate
        UI-->>Customer: Display fee before confirmation

        Customer->>UI: Confirm delivery request
        UI->>API: Create delivery with JWT
        API->>API: Authorize customer and validate request
        API->>DB: Save parcel, agreed fee and Created history
        DB-->>API: Parcel and unique tracking number
        API-->>UI: Return delivery confirmation
        UI-->>Customer: Display tracking number
    end

    opt View live tracking
        Customer->>UI: Open parcel tracking
        UI->>API: Request current status and subscribe through SSE
        API->>API: Check access to requested parcel
        API->>DB: Read current status and history
        DB-->>API: Tracking details
        API-->>UI: Return initial tracking information

        loop While connected and status changes
            Note over API: Status update becomes available
            API-->>UI: Push latest status through SSE
            UI-->>Customer: Refresh tracking timeline
        end
    end

    opt Public tracking without login
        Customer->>UI: Enter public tracking number
        UI->>API: Request public tracking information
        API->>DB: Find parcel by tracking number
        DB-->>API: Parcel status and history
        API-->>UI: Return limited public tracking details
        UI-->>Customer: Display tracking without private contact details
    end

    opt View delivery history
        Customer->>UI: Open delivery history
        UI->>API: Request customer's deliveries with JWT
        API->>DB: Read deliveries owned by customer
        DB-->>API: Delivery history
        API-->>UI: Return delivery list
        UI-->>Customer: Display history
    end

    opt Download receipt
        Customer->>UI: Select Download receipt
        UI->>API: Request receipt with JWT
        API->>API: Verify parcel ownership
        API->>DB: Read delivery and recorded fee
        DB-->>API: Receipt information
        API->>API: Generate receipt PDF
        API-->>UI: Return PDF
        UI-->>Customer: Download receipt
    end
```

## Design notes

| Step | Decision | Why |
|---|---|---|
| Registration | Password hashed (bcrypt/argon2) before saving | Plain passwords never reach the database |
| Google login | Authorization Code flow with `state` + PKCE, handled by the backend | Prevents CSRF and code interception; the client secret never reaches the browser |
| Google login | Backend issues **our own** JWT after verifying Google's ID token | All roles use the same JWT + RBAC checks afterwards |
| Create delivery | Fee is recalculated on the server and stored with the parcel | The client cannot change the price; the receipt shows the agreed fee |
| Live tracking | SSE (one-way server → browser) | Simpler than WebSockets for status pushes; auto-reconnects |
| Public tracking | Limited response (status + timeline, no names/phones/addresses) | Protects personal data on an unauthenticated page |
| Receipt | Ownership check before generating the PDF | A customer can't download another customer's receipt |
