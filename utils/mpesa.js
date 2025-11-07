const axios = require('axios');
const Payment = require('../models/Payment');

class MpesaService {
    constructor() {
        this.consumerKey = process.env.MPESA_CONSUMER_KEY;
        this.consumerSecret = process.env.MPESA_CONSUMER_SECRET;
        this.businessShortCode = process.env.MPESA_BUSINESS_SHORTCODE;
        this.passkey = process.env.MPESA_PASSKEY;
        this.callbackUrl = process.env.MPESA_CALLBACK_URL;
        this.authToken = null;
        this.tokenExpiry = null;
    }

    async getAuthToken() {
        // Check if we have a valid token
        if (this.authToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            return this.authToken;
        }

        const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
        
        try {
            const response = await axios.get(
                'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
                {
                    headers: {
                        Authorization: `Basic ${auth}`
                    }
                }
            );

            this.authToken = response.data.access_token;
            this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // Subtract 1 minute for safety
            
            return this.authToken;
        } catch (error) {
            console.error('MPesa auth error:', error.response?.data || error.message);
            throw new Error('Failed to get MPesa authentication token');
        }
    }

    async initiateSTKPush(phoneNumber, amount, reference, description) {
        try {
            const token = await this.getAuthToken();
            
            const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, -4);
            const password = Buffer.from(
                `${this.businessShortCode}${this.passkey}${timestamp}`
            ).toString('base64');

            const requestData = {
                BusinessShortCode: this.businessShortCode,
                Password: password,
                Timestamp: timestamp,
                TransactionType: 'CustomerPayBillOnline',
                Amount: amount,
                PartyA: phoneNumber,
                PartyB: this.businessShortCode,
                PhoneNumber: phoneNumber,
                CallBackURL: this.callbackUrl,
                AccountReference: reference,
                TransactionDesc: description
            };

            const response = await axios.post(
                'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
                requestData,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            // Create payment record
            const payment = new Payment({
                transactionId: reference,
                user: reference.split('_')[1], // Extract user ID from reference
                type: 'entry_fee',
                amount: amount,
                mpesaResponse: response.data,
                metadata: {
                    phoneNumber: phoneNumber,
                    description: description
                }
            });

            await payment.save();

            return {
                success: true,
                checkoutRequestID: response.data.CheckoutRequestID,
                customerMessage: response.data.CustomerMessage
            };

        } catch (error) {
            console.error('MPesa STK push error:', error.response?.data || error.message);
            
            // Create failed payment record
            const payment = new Payment({
                transactionId: reference,
                user: reference.split('_')[1],
                type: 'entry_fee',
                amount: amount,
                status: 'failed',
                metadata: {
                    phoneNumber: phoneNumber,
                    description: description,
                    notes: error.response?.data?.errorMessage || error.message
                }
            });

            await payment.save();

            return {
                success: false,
                error: error.response?.data?.errorMessage || 'Payment initiation failed'
            };
        }
    }

    async handleCallback(callbackData) {
        try {
            const resultCode = callbackData.Body.stkCallback.ResultCode;
            const resultDesc = callbackData.Body.stkCallback.ResultDesc;
            const callbackMetadata = callbackData.Body.stkCallback.CallbackMetadata;
            
            if (resultCode === 0) {
                // Successful payment
                const metadata = {};
                if (callbackMetadata && callbackMetadata.Item) {
                    callbackMetadata.Item.forEach(item => {
                        metadata[item.Name] = item.Value;
                    });
                }

                // Find and update payment
                const payment = await Payment.findOne({
                    'mpesaResponse.CheckoutRequestID': callbackData.Body.stkCallback.CheckoutRequestID
                });

                if (payment) {
                    await payment.markAsCompleted({
                        ResultCode: resultCode,
                        ResultDesc: resultDesc,
                        MpesaReceiptNumber: metadata.MpesaReceiptNumber,
                        TransactionDate: metadata.TransactionDate,
                        PhoneNumber: metadata.PhoneNumber
                    });

                    // Here you would typically update tournament registration, etc.
                    console.log(`Payment completed for user: ${payment.user}`);
                }

                return { success: true, message: 'Payment processed successfully' };
            } else {
                // Failed payment
                const payment = await Payment.findOne({
                    'mpesaResponse.CheckoutRequestID': callbackData.Body.stkCallback.CheckoutRequestID
                });

                if (payment) {
                    await payment.markAsFailed(resultDesc);
                }

                return { success: false, message: resultDesc };
            }

        } catch (error) {
            console.error('MPesa callback error:', error);
            return { success: false, message: 'Callback processing failed' };
        }
    }

    async checkTransactionStatus(checkoutRequestID) {
        try {
            const token = await this.getAuthToken();
            const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, -4);
            const password = Buffer.from(
                `${this.businessShortCode}${this.passkey}${timestamp}`
            ).toString('base64');

            const requestData = {
                BusinessShortCode: this.businessShortCode,
                Password: password,
                Timestamp: timestamp,
                CheckoutRequestID: checkoutRequestID
            };

            const response = await axios.post(
                'https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query',
                requestData,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return response.data;

        } catch (error) {
            console.error('MPesa status check error:', error.response?.data || error.message);
            throw new Error('Failed to check transaction status');
        }
    }
}

module.exports = new MpesaService();