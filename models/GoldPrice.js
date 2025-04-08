const mongoose = require("mongoose")

const goldPriceSchema = new mongoose.Schema(
    {
        goldType: {
            type: String,
            required: true,
        },
        goldBuyPrice: {
            type: String,
            required: true,
        },
        goldSellPrice: {
            type: String,
            required: true,
        },
        timestamp: {
            type: Date,
            required: true,
            default: Date.now,
        },
    },
    { timestamps: true }
)

const GoldPrice = mongoose.model("GoldPrice", goldPriceSchema);

module.exports = GoldPrice;