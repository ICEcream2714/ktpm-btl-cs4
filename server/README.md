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
npm run dev
```

## **Mô tả db**
1. GoldPrice
    - goldType: Loại vàng (SJC, PNJ, ...)
    - goldBuyPrice: Giá mua vào (VND)
    - goldSellPrice: Giá bán ra (VND)
    - timestamp: Thời gian giá vàng được ghi nhận


## **Mô tả các API**
1. /gold-price
    - Method: POST
    - Thêm object vào db
    - Params:
        - goldType: Loại vàng (SJC, PNJ, ...)
        - goldBuyPrice: Giá mua vào (VND)
        - goldSellPrice: Giá bán ra (VND)
        - timestamp: Thời gian giá được ghi nhận
    
2. /gold-price
    - Method: GET
    - Lấy các object theo ngày
    - Query: Mặc định hoặc thiếu 1 trong 3 params là lấy ngày hiện tại
        - day: Ngày
        - month: Tháng
        - year: Năm

3. /gold-price/:id
    - Method: DELETE
    - Xóa object bằng id
    - Params: 
        - id: id của object
        