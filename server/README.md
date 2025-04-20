# **Backend docs**

## **Setup**

Dựng docker mongodb

```
docker-compose up -d --build
```

Thiết lập file .env từ .env.example

Chạy thôi

```
npm install
node import_data.js
npm run dev
```

## **Mô tả db**

1. MarketData
   - dataType: Loại dữ liệu. Có 15 loại, chia làm 3 topics:
     - Currencies: EUR_USD, GBP_USD, USD_VND, BTC_USD, ETH_USD
     - Energy: Brent, WTI, Gasoline RBOB, Gas, Heating Oil
     - Metals: Gold, Silver, Copper, SJC, PNJ
   - dataPrice: Giá tiền (USD)
   - timestamp: Thời gian giá được ghi nhận

## **Mô tả các API**

1. /market-data
   - Method: POST
   - Thêm object vào db
   - Params:
     - dataType
     - dataPrice
     - timestamp
2. /market-data

   - Method: GET
   - Lấy các object theo ngày gần nhất với query
   - Query: Mặc định hoặc thiếu 1 trong 3 params là lấy ngày hiện tại
     - day: Ngày
     - month: Tháng
     - year: Năm

3. /market-data/:id
   - Method: DELETE
   - Xóa object bằng id
   - Params:
     - id: id của object

# Market Data Pub/Sub Architecture

## RabbitMQ Publish/Subscribe Pattern

This project implements a publish/subscribe (pub/sub) pattern using RabbitMQ as a message broker for distributing real-time market data updates.

```
┌───────────────┐                 ┌──────────────────┐                ┌───────────────────┐
│               │                 │                  │                │                   │
│  PUBLISHERS   │ ─── HTTP ─────> │     SERVER       │ ──publish───>  │  MESSAGE BROKER   │
│               │                 │                  │                │     (RabbitMQ)    │
└───────────────┘                 └──────────────────┘                └─────────┬─────────┘
                                                                                │
                                                                                │ routes messages
                                                                                │ to queues
                                                                                ▼
┌───────────────┐                 ┌──────────────────┐                ┌───────────────────┐
│               │                 │                  │                │                   │
│  CLIENTS      │ <─ Socket.IO ── │    SUBSCRIBERS   │ <──subscribe── │     QUEUES        │
│  (Browsers)   │                 │                  │                │                   │
└───────────────┘                 └──────────────────┘                └───────────────────┘
```

## Key Components in the Architecture

### Publishers

- **HTTP Client** (`test-producer.js`): Simulates market data producers sending updates
- **API Endpoint** (`POST /market-data`): Receives data updates and acts as a publisher to RabbitMQ

### Message Broker (RabbitMQ)

- **Exchanges**:
  - `market_data`: Routes messages by market data ID
  - `market_data_type`: Routes messages by data type (Gold, BTC_USD, etc.)
- **Queues**:
  - `market_data_updates`: Stores messages for ID-based subscribers
  - `market_data_type_updates`: Stores messages for type-based subscribers

### Subscribers

- **RabbitMQ Consumers** (`setupRabbitMQConsumers`): Subscribe to RabbitMQ queues and forward messages to Socket.IO

### Clients

- **React App** (`market-data-dashboard.tsx`): Connects via Socket.IO to receive real-time updates

## Data Flow

1. **Publishers** send market data to the server's HTTP endpoint
2. Server saves data to MongoDB and **publishes** to RabbitMQ exchanges
3. RabbitMQ **routes** messages to appropriate queues based on binding keys
4. **Subscribers** consume messages from the queues
5. Subscribers forward messages to connected clients via Socket.IO
6. **Clients** (browsers) display the real-time updates

## Benefits of This Architecture

1. **Decoupling**: Publishers and subscribers don't need to know about each other
2. **Scalability**: Can add more publishers or subscribers without affecting existing components
3. **Reliability**: Messages persist in RabbitMQ even if subscribers are temporarily unavailable
4. **Flexibility**: Can easily add new types of subscribers (analytics, notifications, etc.)

## Running the Example

1. Start the services with Docker Compose:

   ```bash
   docker-compose up -d
   ```

2. Start the server:

   ```bash
   node server.js
   ```

3. Run the test producer to generate market data:

   ```bash
   node test-producer.js
   ```

4. Open the client application to view real-time updates
