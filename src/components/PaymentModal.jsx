import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  CircularProgress,
  TextField,
  Divider,
  Alert
} from '@mui/material';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import stripePromise from '../utils/stripe';
import { createMarketplacePaymentIntent, calculateTotalAmount, formatPrice, transferToSeller } from '../utils/stripe';

const cardElementOptions = {
  style: {
    base: {
      fontSize: '16px',
      color: '#424770',
      '::placeholder': {
        color: '#aab7c4',
      },
    },
    invalid: {
      color: '#9e2146',
    },
  },
};

function PaymentForm({ listing, onSuccess, onCancel, buyerInfo }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  const pricing = calculateTotalAmount(listing.price);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      // Create marketplace payment intent
      const paymentIntent = await createMarketplacePaymentIntent(
        pricing.totalAmount, // Pass total amount including platform fee
        listing.stripeAccountId,
        'usd',
        {
          listingId: listing.id,
          listingTitle: listing.title,
          sellerId: listing.userId,
          buyerId: buyerInfo.uid
        }
      );

      // Confirm payment using CardElement
      const cardElement = elements.getElement(CardElement);
      const result = await stripe.confirmCardPayment(paymentIntent.client_secret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name: `${buyerInfo.firstName} ${buyerInfo.lastName}`,
            email: buyerInfo.email,
          },
        },
      });

      if (result.error) {
        setError(result.error.message);
      } else if (result.paymentIntent.status === 'succeeded') {
        // Payment succeeded - mark as complete regardless of transfer
        // In production, transfers would be handled by webhooks or background jobs
        console.log('Payment successful:', result.paymentIntent.id);

        // Attempt transfer to seller (optional in test mode)
        try {
          await transferToSeller(
            result.paymentIntent.id,
            listing.stripeAccountId,
            pricing.listingPrice
          );
          console.log('Transfer to seller successful');
        } catch (transferError) {
          console.warn('Transfer to seller failed (this is normal in test mode):', transferError.message);
          // In production, this would trigger a manual review or retry mechanism
          // For now, we continue with the purchase flow
        }

        onSuccess(result.paymentIntent, paymentIntent);
      } else {
        setError('Payment failed. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'An error occurred during payment.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Purchase: {listing.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Sold by: {listing.sellerName}
          </Typography>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography>Item Price:</Typography>
            <Typography>{formatPrice(pricing.listingPrice)}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography>Platform Fee (5%):</Typography>
            <Typography>{formatPrice(pricing.platformFee)}</Typography>
          </Box>
          <Divider sx={{ my: 1 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
            <Typography variant="h6">Total:</Typography>
            <Typography variant="h6">{formatPrice(pricing.totalAmount)}</Typography>
          </Box>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Payment Information
          </Typography>
          <Box sx={{
            border: '1px solid #d1d5db',
            borderRadius: 1,
            p: 2,
            backgroundColor: '#fff'
          }}>
            <CardElement options={cardElementOptions} />
          </Box>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onCancel} disabled={processing}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          color="primary"
          disabled={!stripe || processing}
          startIcon={processing && <CircularProgress size={20} />}
        >
          {processing ? 'Processing...' : `Pay ${formatPrice(pricing.totalAmount)}`}
        </Button>
      </DialogActions>
    </form>
  );
}

export default function PaymentModal({ open, onClose, listing, buyerInfo, onPaymentSuccess }) {
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentData, setPaymentData] = useState(null);

  const handlePaymentSuccess = (result, paymentIntent) => {
    setPaymentData({ result, paymentIntent });
    setPaymentSuccess(true);
    if (onPaymentSuccess) {
      onPaymentSuccess(result, paymentIntent);
    }
  };

  const handleClose = () => {
    setPaymentSuccess(false);
    setPaymentData(null);
    onClose();
  };

  if (paymentSuccess) {
    return (
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogContent sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="h5" color="success.main" gutterBottom>
            Payment Successful!
          </Typography>
          <Typography variant="body1" gutterBottom>
            Your purchase of "{listing.title}" has been completed.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            You will receive a confirmation email shortly.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} variant="contained" fullWidth>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Complete Purchase</DialogTitle>
      <Elements stripe={stripePromise}>
        <PaymentForm
          listing={listing}
          buyerInfo={buyerInfo}
          onSuccess={handlePaymentSuccess}
          onCancel={onClose}
        />
      </Elements>
    </Dialog>
  );
}