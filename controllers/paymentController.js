const Payment = require('../models/Payment');
const Tournament = require('../models/Tournament');
const User = require('../models/Users');
const mpesaService = require('../utils/mpesa');

class PaymentController {
    // Initiate payment for tournament entry
    static async initiatePayment(req, res) {
        try {
            const { tournamentId, phoneNumber } = req.body;

            // Validate tournament
            const tournament = await Tournament.findById(tournamentId);
            if (!tournament) {
                return res.status(404).json({
                    success: false,
                    message: 'Tournament not found'
                });
            }

            // Check if user is already registered
            const isRegistered = tournament.participants.some(
                p => p.player.toString() === req.user.id
            );

            if (isRegistered) {
                return res.status(400).json({
                    success: false,
                    message: 'You are already registered for this tournament'
                });
            }

            // Check if tournament has entry fee
            if (tournament.settings.entryFee <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'This tournament has no entry fee'
                });
            }

            // Validate phone number
            const cleanPhone = phoneNumber.replace(/\s/g, '');
            if (!/^(07\d{8}|2547\d{8}|\+2547\d{8})$/.test(cleanPhone)) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide a valid Kenyan phone number'
                });
            }

            // Format phone number for MPesa
            let formattedPhone = cleanPhone;
            if (cleanPhone.startsWith('07')) {
                formattedPhone = '254' + cleanPhone.substring(1);
            } else if (cleanPhone.startsWith('+254')) {
                formattedPhone = cleanPhone.substring(1);
            }

            // Generate unique reference
            const reference = `TKFEE_${req.user.id}_${tournamentId}_${Date.now()}`;

            // Initiate MPesa payment
            const result = await mpesaService.initiateSTKPush(
                formattedPhone,
                tournament.settings.entryFee,
                reference,
                `Tournament Entry: ${tournament.name}`
            );

            if (result.success) {
                res.json({
                    success: true,
                    message: 'Payment initiated successfully',
                    checkoutRequestID: result.checkoutRequestID,
                    customerMessage: result.customerMessage
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: result.error
                });
            }

        } catch (error) {
            console.error('Initiate payment error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to initiate payment',
                error: error.message
            });
        }
    }

    // Handle MPesa callback
    static async handleCallback(req, res) {
        try {
            const callbackData = req.body;
            
            // Process the callback
            const result = await mpesaService.handleCallback(callbackData);
            
            if (result.success) {
                res.status(200).json({
                    ResultCode: 0,
                    ResultDesc: 'Success'
                });
            } else {
                res.status(200).json({
                    ResultCode: 1,
                    ResultDesc: result.message
                });
            }

        } catch (error) {
            console.error('Payment callback error:', error);
            res.status(200).json({
                ResultCode: 1,
                ResultDesc: 'Callback processing failed'
            });
        }
    }

    // Check payment status
    static async checkPaymentStatus(req, res) {
        try {
            const payment = await Payment.findOne({
                'mpesaResponse.CheckoutRequestID': req.params.checkoutRequestID
            });

            if (!payment) {
                return res.status(404).json({
                    success: false,
                    message: 'Payment not found'
                });
            }

            // If payment is already completed, return status
            if (payment.status === 'completed') {
                return res.json({
                    success: true,
                    status: 'completed',
                    payment
                });
            }

            // Check status from MPesa
            const statusResult = await mpesaService.checkTransactionStatus(
                req.params.checkoutRequestID
            );

            if (statusResult.ResultCode === 0) {
                // Payment completed
                await payment.markAsCompleted({
                    ResultCode: statusResult.ResultCode,
                    ResultDesc: statusResult.ResultDesc,
                    MpesaReceiptNumber: statusResult.MpesaReceiptNumber,
                    TransactionDate: statusResult.TransactionDate,
                    PhoneNumber: statusResult.PhoneNumber
                });

                // Register player for tournament if this is an entry fee
                if (payment.type === 'entry_fee' && payment.tournament) {
                    const tournament = await Tournament.findById(payment.tournament);
                    if (tournament) {
                        await tournament.addParticipant(payment.user);
                    }
                }
            }

            res.json({
                success: true,
                status: payment.status,
                payment
            });

        } catch (error) {
            console.error('Check payment status error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to check payment status',
                error: error.message
            });
        }
    }

    // Get user payment history
    static async getPaymentHistory(req, res) {
        try {
            const { page = 1, limit = 10 } = req.query;
            const skip = (page - 1) * limit;

            const payments = await Payment.find({ user: req.user.id })
                .populate('tournament', 'name')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit));

            const total = await Payment.countDocuments({ user: req.user.id });

            res.json({
                success: true,
                payments,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            });

        } catch (error) {
            console.error('Get payment history error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch payment history',
                error: error.message
            });
        }
    }

    // Initiate prize payout (Admin)
    static async initiatePrizePayout(req, res) {
        try {
            const { tournamentId, playerId, amount, phoneNumber, description } = req.body;

            // Validate tournament and player
            const tournament = await Tournament.findById(tournamentId);
            const player = await User.findById(playerId);

            if (!tournament || !player) {
                return res.status(404).json({
                    success: false,
                    message: 'Tournament or player not found'
                });
            }

            // Format phone number
            let formattedPhone = phoneNumber.replace(/\s/g, '');
            if (formattedPhone.startsWith('07')) {
                formattedPhone = '254' + formattedPhone.substring(1);
            } else if (formattedPhone.startsWith('+254')) {
                formattedPhone = formattedPhone.substring(1);
            }

            // Generate reference
            const reference = `PRIZE_${playerId}_${tournamentId}_${Date.now()}`;

            // Create payment record for prize payout
            const payment = new Payment({
                transactionId: reference,
                user: playerId,
                tournament: tournamentId,
                type: 'prize_payout',
                amount: amount,
                status: 'completed', // Simulate successful payout for now
                metadata: {
                    phoneNumber: formattedPhone,
                    description: description || `Prize for ${tournament.name}`
                }
            });

            await payment.save();

            res.json({
                success: true,
                message: 'Prize payout initiated successfully',
                payment
            });

        } catch (error) {
            console.error('Prize payout error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to initiate prize payout',
                error: error.message
            });
        }
    }

    // Get payment statistics (Admin)
    static async getPaymentStatistics(req, res) {
        try {
            const totalRevenue = await Payment.aggregate([
                { $match: { status: 'completed', type: 'entry_fee' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]);

            const totalPayouts = await Payment.aggregate([
                { $match: { status: 'completed', type: 'prize_payout' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]);

            const paymentsByStatus = await Payment.aggregate([
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 },
                        amount: { $sum: '$amount' }
                    }
                }
            ]);

            const recentPayments = await Payment.find()
                .populate('user', 'efootballId')
                .populate('tournament', 'name')
                .sort({ createdAt: -1 })
                .limit(10);

            // Monthly revenue
            const monthlyRevenue = await Payment.aggregate([
                {
                    $match: {
                        status: 'completed',
                        type: 'entry_fee',
                        createdAt: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
                    }
                },
                {
                    $group: {
                        _id: {
                            year: { $year: '$createdAt' },
                            month: { $month: '$createdAt' }
                        },
                        revenue: { $sum: '$amount' }
                    }
                },
                { $sort: { '_id.year': 1, '_id.month': 1 } }
            ]);

            res.json({
                success: true,
                statistics: {
                    totalRevenue: totalRevenue[0]?.total || 0,
                    totalPayouts: totalPayouts[0]?.total || 0,
                    netRevenue: (totalRevenue[0]?.total || 0) - (totalPayouts[0]?.total || 0),
                    paymentsByStatus,
                    monthlyRevenue,
                    recentPayments
                }
            });

        } catch (error) {
            console.error('Get payment statistics error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch payment statistics',
                error: error.message
            });
        }
    }

    // Get all payments (Admin)
    static async getAllPayments(req, res) {
        try {
            const { page = 1, limit = 20, status } = req.query;
            const skip = (page - 1) * limit;

            const query = {};
            if (status && status !== 'all') {
                query.status = status;
            }

            const payments = await Payment.find(query)
                .populate('user', 'efootballId whatsapp')
                .populate('tournament', 'name')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit));

            const total = await Payment.countDocuments(query);

            res.json({
                success: true,
                payments,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            });

        } catch (error) {
            console.error('Get all payments error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch payments',
                error: error.message
            });
        }
    }
}

module.exports = PaymentController;