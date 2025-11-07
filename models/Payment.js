const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    transactionId: {
        type: String,
        required: true,
        unique: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    tournament: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tournament'
    },
    type: {
        type: String,
        enum: ['entry_fee', 'prize_payout', 'refund'],
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'cancelled'],
        default: 'pending'
    },
    mpesaResponse: {
        MerchantRequestID: String,
        CheckoutRequestID: String,
        ResponseCode: String,
        ResponseDescription: String,
        CustomerMessage: String
    },
    mpesaCallback: {
        ResultCode: String,
        ResultDesc: String,
        MpesaReceiptNumber: String,
        TransactionDate: String,
        PhoneNumber: String
    },
    metadata: {
        phoneNumber: String,
        description: String,
        notes: String
    }
}, {
    timestamps: true
});

// Indexes
paymentSchema.index({ user: 1 });
paymentSchema.index({ tournament: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ createdAt: 1 });

// Static method to find pending payments
paymentSchema.statics.findPending = function() {
    return this.find({ status: 'pending' })
        .populate('user', 'whatsapp efootballId')
        .populate('tournament', 'name');
};

// Method to mark as completed
paymentSchema.methods.markAsCompleted = function(mpesaData = {}) {
    this.status = 'completed';
    this.mpesaCallback = mpesaData;
    return this.save();
};

// Method to mark as failed
paymentSchema.methods.markAsFailed = function(reason) {
    this.status = 'failed';
    this.metadata.notes = reason;
    return this.save();
};

module.exports = mongoose.model('Payment', paymentSchema);