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
    - dataType: Loại dữ liệu (Vàng Mỹ, Bạc, Tỷ giá,...)
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
        