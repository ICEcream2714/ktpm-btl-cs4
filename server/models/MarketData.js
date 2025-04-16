const mongoose = require("mongoose")

const marketDataSchema = new mongoose.Schema(
    {
        dataType: {
            type: String,
            required: true,
        },
        dataPrice: {
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

const MarketData = mongoose.model("MarketData", marketDataSchema);

module.exports = MarketData;