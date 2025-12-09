IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'eventix')
BEGIN
    CREATE DATABASE eventix;
END
GO

USE eventix;
GO

-- Users Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Users')
BEGIN
    CREATE TABLE Users (
        id NVARCHAR(50) PRIMARY KEY DEFAULT NEWID(),
        email NVARCHAR(255) NOT NULL UNIQUE,
        passwordHash NVARCHAR(255) NOT NULL,
        firstName NVARCHAR(100) NOT NULL,
        lastName NVARCHAR(100) NOT NULL,
        phone NVARCHAR(50),
        profileImageUrl NVARCHAR(500),
        emailVerified BIT DEFAULT 0,
        emailVerifiedAt DATETIME2,
        createdAt DATETIME2 DEFAULT SYSDATETIME(),
        updatedAt DATETIME2 DEFAULT SYSDATETIME()
    );
    CREATE INDEX IX_Users_Email ON Users(email);
    CREATE INDEX IX_Users_CreatedAt ON Users(createdAt);
END

-- Sessions Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Sessions')
BEGIN
    CREATE TABLE Sessions (
        id NVARCHAR(50) PRIMARY KEY DEFAULT NEWID(),
        userId NVARCHAR(50) NOT NULL,
        tokenHash NVARCHAR(255) NOT NULL UNIQUE,
        refreshTokenHash NVARCHAR(255) NOT NULL UNIQUE,
        deviceInfo NVARCHAR(500),
        ipAddress NVARCHAR(50),
        expiresAt DATETIME2 NOT NULL,
        createdAt DATETIME2 DEFAULT SYSDATETIME(),
        revokedAt DATETIME2,
        CONSTRAINT FK_Sessions_Users FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
    );
    CREATE INDEX IX_Sessions_UserId ON Sessions(userId);
    CREATE INDEX IX_Sessions_ExpiresAt ON Sessions(expiresAt);
END

-- Events Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Events')
BEGIN
    CREATE TABLE Events (
        id NVARCHAR(50) PRIMARY KEY DEFAULT NEWID(),
        title NVARCHAR(255) NOT NULL,
        artist NVARCHAR(150) NOT NULL,
        description NVARCHAR(MAX) NOT NULL,
        category NVARCHAR(50) NOT NULL,
        date DATETIME2 NOT NULL,
        time NVARCHAR(10) NOT NULL,
        year INT NOT NULL,
        organizerId NVARCHAR(50),
        status NVARCHAR(20) DEFAULT 'active',
        venueName NVARCHAR(255) NOT NULL,
        venueAddress NVARCHAR(500),
        venueCity NVARCHAR(100) NOT NULL,
        venueCapacity INT NOT NULL,
        imageUrl NVARCHAR(500),
        bannerImageUrl NVARCHAR(500),
        tags NVARCHAR(MAX), -- JSON stored as string
        isFeatured BIT DEFAULT 0,
        viewCount INT DEFAULT 0,
        createdAt DATETIME2 DEFAULT SYSDATETIME(),
        updatedAt DATETIME2 DEFAULT SYSDATETIME()
    );
    CREATE INDEX IX_Events_Category ON Events(category);
    CREATE INDEX IX_Events_Date ON Events(date);
    CREATE INDEX IX_Events_VenueCity ON Events(venueCity);
    CREATE INDEX IX_Events_IsFeatured ON Events(isFeatured);
    CREATE INDEX IX_Events_Status ON Events(status);
    CREATE INDEX IX_Events_Year ON Events(year);
END

-- EventReviews Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EventReviews')
BEGIN
    CREATE TABLE EventReviews (
        id NVARCHAR(50) PRIMARY KEY DEFAULT NEWID(),
        eventId NVARCHAR(50) NOT NULL,
        userId NVARCHAR(50) NOT NULL,
        rating INT NOT NULL,
        comment NVARCHAR(MAX),
        createdAt DATETIME2 DEFAULT SYSDATETIME(),
        CONSTRAINT FK_EventReviews_Events FOREIGN KEY (eventId) REFERENCES Events(id),
        CONSTRAINT FK_EventReviews_Users FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE,
        CONSTRAINT UQ_EventReviews_Event_User UNIQUE (eventId, userId)
    );
    CREATE INDEX IX_EventReviews_EventId ON EventReviews(eventId);
    CREATE INDEX IX_EventReviews_UserId ON EventReviews(userId);
END

-- TicketCategories Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TicketCategories')
BEGIN
    CREATE TABLE TicketCategories (
        id NVARCHAR(50) PRIMARY KEY DEFAULT NEWID(),
        event_id NVARCHAR(50) NOT NULL,
        name NVARCHAR(100) NOT NULL,
        display_name NVARCHAR(100) NOT NULL,
        description NVARCHAR(MAX),
        price DECIMAL(10, 2) NOT NULL,
        currency NVARCHAR(10) DEFAULT 'IDR',
        quantity_total INT NOT NULL,
        available_quantity INT NOT NULL,
        benefits NVARCHAR(MAX), -- JSON stored as string
        sort_order INT DEFAULT 0,
        created_at DATETIME2 DEFAULT SYSDATETIME(),
        updated_at DATETIME2 DEFAULT SYSDATETIME(),
        CONSTRAINT FK_TicketCategories_Events FOREIGN KEY (event_id) REFERENCES Events(id) ON DELETE CASCADE
    );
    CREATE INDEX IX_TicketCategories_EventId ON TicketCategories(event_id);
END

-- Orders Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Orders')
BEGIN
    CREATE TABLE Orders (
        id NVARCHAR(50) PRIMARY KEY DEFAULT NEWID(),
        order_number NVARCHAR(50) NOT NULL UNIQUE,
        user_id NVARCHAR(50),
        event_id NVARCHAR(50) NOT NULL,
        hold_token NVARCHAR(150) NOT NULL UNIQUE,
        status NVARCHAR(20) DEFAULT 'pending_payment',
        attendee_first_name NVARCHAR(100) NOT NULL,
        attendee_last_name NVARCHAR(100) NOT NULL,
        attendee_email NVARCHAR(255) NOT NULL,
        attendee_phone NVARCHAR(50) NOT NULL,
        subtotal DECIMAL(10, 2) NOT NULL,
        service_fee DECIMAL(10, 2) DEFAULT 0,
        processing_fee DECIMAL(10, 2) DEFAULT 0,
        tax DECIMAL(10, 2) DEFAULT 0,
        discount DECIMAL(10, 2) DEFAULT 0,
        total_amount DECIMAL(10, 2) NOT NULL,
        currency NVARCHAR(10) DEFAULT 'IDR',
        promo_code_used NVARCHAR(50),
        payment_method NVARCHAR(50),
        payment_status NVARCHAR(20) DEFAULT 'pending',
        payment_reference NVARCHAR(100),
        paid_at DATETIME2,
        created_at DATETIME2 DEFAULT SYSDATETIME(),
        updated_at DATETIME2 DEFAULT SYSDATETIME(),
        expires_at DATETIME2,
        CONSTRAINT FK_Orders_Users FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
        CONSTRAINT FK_Orders_Events FOREIGN KEY (event_id) REFERENCES Events(id)
    );
    CREATE INDEX IX_Orders_UserId ON Orders(user_id);
    CREATE INDEX IX_Orders_EventId ON Orders(event_id);
    CREATE INDEX IX_Orders_Status ON Orders(status);
    CREATE INDEX IX_Orders_PaymentStatus ON Orders(payment_status);
    CREATE INDEX IX_Orders_OrderNumber ON Orders(order_number);
    CREATE INDEX IX_Orders_CreatedAt ON Orders(created_at);
END

-- OrderItems Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'OrderItems')
BEGIN
    CREATE TABLE OrderItems (
        id NVARCHAR(50) PRIMARY KEY DEFAULT NEWID(),
        order_id NVARCHAR(50) NOT NULL,
        category_id NVARCHAR(50) NOT NULL,
        quantity INT NOT NULL,
        unit_price DECIMAL(10, 2) NOT NULL,
        created_at DATETIME2 DEFAULT SYSDATETIME(),
        updated_at DATETIME2 DEFAULT SYSDATETIME(),
        CONSTRAINT FK_OrderItems_Orders FOREIGN KEY (order_id) REFERENCES Orders(id) ON DELETE CASCADE,
        CONSTRAINT FK_OrderItems_TicketCategories FOREIGN KEY (category_id) REFERENCES TicketCategories(id),
        CONSTRAINT UQ_OrderItems_Order_Category UNIQUE (order_id, category_id)
    );
    CREATE INDEX IX_OrderItems_CategoryId ON OrderItems(category_id);
END

-- Tickets Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Tickets')
BEGIN
    CREATE TABLE Tickets (
        id NVARCHAR(50) PRIMARY KEY DEFAULT NEWID(),
        ticket_number NVARCHAR(50) NOT NULL UNIQUE,
        order_id NVARCHAR(50) NOT NULL,
        event_id NVARCHAR(50) NOT NULL,
        category_id NVARCHAR(50) NOT NULL,
        qr_code_url NVARCHAR(500),
        qr_code_data NVARCHAR(255) NOT NULL UNIQUE,
        barcode_data NVARCHAR(255) UNIQUE,
        status NVARCHAR(20) DEFAULT 'valid',
        used_at DATETIME2,
        scanned_by NVARCHAR(100),
        transferred_to_email NVARCHAR(255),
        transferred_at DATETIME2,
        original_order_id NVARCHAR(50),
        created_at DATETIME2 DEFAULT SYSDATETIME(),
        CONSTRAINT FK_Tickets_Orders FOREIGN KEY (order_id) REFERENCES Orders(id),
        CONSTRAINT FK_Tickets_TicketCategories FOREIGN KEY (category_id) REFERENCES TicketCategories(id)
    );
    CREATE INDEX IX_Tickets_OrderId ON Tickets(order_id);
    CREATE INDEX IX_Tickets_EventId ON Tickets(event_id);
    CREATE INDEX IX_Tickets_Status ON Tickets(status);
    CREATE INDEX IX_Tickets_QrCodeData ON Tickets(qr_code_data);
END

-- PaymentLogs Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PaymentLogs')
BEGIN
    CREATE TABLE PaymentLogs (
        id NVARCHAR(50) PRIMARY KEY DEFAULT NEWID(),
        order_id NVARCHAR(50) NOT NULL,
        paymentMethod NVARCHAR(50) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        currency NVARCHAR(10) NOT NULL,
        status NVARCHAR(20) NOT NULL,
        gateway_reference NVARCHAR(100),
        gateway_response NVARCHAR(MAX),
        error_message NVARCHAR(MAX),
        created_at DATETIME2 DEFAULT SYSDATETIME(),
        CONSTRAINT FK_PaymentLogs_Orders FOREIGN KEY (order_id) REFERENCES Orders(id) ON DELETE CASCADE
    );
    CREATE INDEX IX_PaymentLogs_OrderId ON PaymentLogs(order_id);
    CREATE INDEX IX_PaymentLogs_Status ON PaymentLogs(status);
END

-- ApiIdempotency Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ApiIdempotency')
BEGIN
    CREATE TABLE ApiIdempotency (
        id NVARCHAR(50) PRIMARY KEY DEFAULT NEWID(),
        idempotency_key NVARCHAR(150) NOT NULL UNIQUE,
        status NVARCHAR(20) NOT NULL,
        request_fingerprint NVARCHAR(2000),
        hold_token NVARCHAR(150),
        response_payload NVARCHAR(MAX), -- JSON stored as string
        created_at DATETIME2 DEFAULT SYSDATETIME(),
        updated_at DATETIME2 DEFAULT SYSDATETIME(),
        completed_at DATETIME2,
        expires_at DATETIME2
    );
    CREATE INDEX IX_ApiIdempotency_ExpiresAt ON ApiIdempotency(expires_at);
END

-- PromoCodes Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PromoCodes')
BEGIN
    CREATE TABLE PromoCodes (
        id NVARCHAR(50) PRIMARY KEY DEFAULT NEWID(),
        code NVARCHAR(50) NOT NULL UNIQUE,
        description NVARCHAR(255),
        discountType NVARCHAR(20) NOT NULL,
        discountValue DECIMAL(10, 2) NOT NULL,
        maxUsageCount INT,
        usageCount INT DEFAULT 0,
        maxUsagePerUser INT DEFAULT 1,
        minimumOrderAmount DECIMAL(10, 2),
        applicableCategories NVARCHAR(MAX), -- JSON stored as string
        validFrom DATETIME2 NOT NULL,
        validUntil DATETIME2 NOT NULL,
        isActive BIT DEFAULT 1,
        createdAt DATETIME2 DEFAULT SYSDATETIME(),
        updatedAt DATETIME2 DEFAULT SYSDATETIME()
    );
    CREATE INDEX IX_PromoCodes_Code ON PromoCodes(code);
    CREATE INDEX IX_PromoCodes_IsActive ON PromoCodes(isActive);
    CREATE INDEX IX_PromoCodes_ValidFrom ON PromoCodes(validFrom);
    CREATE INDEX IX_PromoCodes_ValidUntil ON PromoCodes(validUntil);
END

-- AuditLogs Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AuditLogs')
BEGIN
    CREATE TABLE AuditLogs (
        id NVARCHAR(50) PRIMARY KEY DEFAULT NEWID(),
        action NVARCHAR(50) NOT NULL,
        resourceType NVARCHAR(50) NOT NULL,
        resourceId NVARCHAR(50) NOT NULL,
        userId NVARCHAR(50),
        changes NVARCHAR(MAX), -- JSON stored as string
        ipAddress NVARCHAR(50),
        userAgent NVARCHAR(500),
        createdAt DATETIME2 DEFAULT SYSDATETIME()
    );
    CREATE INDEX IX_AuditLogs_ResourceType ON AuditLogs(resourceType);
    CREATE INDEX IX_AuditLogs_ResourceId ON AuditLogs(resourceId);
    CREATE INDEX IX_AuditLogs_UserId ON AuditLogs(userId);
    CREATE INDEX IX_AuditLogs_CreatedAt ON AuditLogs(createdAt);
END

-- SystemLogs Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SystemLogs')
BEGIN
    CREATE TABLE SystemLogs (
        id NVARCHAR(50) PRIMARY KEY DEFAULT NEWID(),
        level NVARCHAR(20) NOT NULL,
        message NVARCHAR(MAX) NOT NULL,
        context NVARCHAR(MAX), -- JSON stored as string
        createdAt DATETIME2 DEFAULT SYSDATETIME()
    );
    CREATE INDEX IX_SystemLogs_Level ON SystemLogs(level);
    CREATE INDEX IX_SystemLogs_CreatedAt ON SystemLogs(createdAt);
END
