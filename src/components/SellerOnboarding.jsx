import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Stepper,
  Step,
  StepLabel,
  Alert,
  CircularProgress,
  Chip,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { CheckCircle, ErrorOutline, Info } from '@mui/icons-material';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../contexts/AuthContext';
import {
  createConnectAccount,
  createAccountLink,
  getConnectAccountStatus,
} from '../utils/stripe';

const steps = [
  'Start Seller Registration',
  'Complete Stripe Onboarding',
  'Verification Complete'
];

export default function SellerOnboarding({ open, onClose, onComplete }) {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [stripeAccount, setStripeAccount] = useState(null);
  const [onboardingStatus, setOnboardingStatus] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && currentUser) {
      checkExistingOnboarding();
    }
  }, [open, currentUser]);

  const checkExistingOnboarding = async () => {
    try {
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      const userData = userDoc.data();

      if (userData?.stripeAccountId) {
        setStripeAccount({ id: userData.stripeAccountId });
        try {
          await checkOnboardingStatus(userData.stripeAccountId);
        } catch (statusError) {
          // If account doesn't exist in new Stripe account, clear it
          if (statusError.message.includes('does not exist') || statusError.message.includes('revoked')) {
            console.warn('Clearing invalid Stripe account ID');
            await updateDoc(doc(db, 'users', currentUser.uid), {
              stripeAccountId: null,
              sellerOnboardingStarted: null
            });
            setStripeAccount(null);
            setOnboardingStatus(null);
            setActiveStep(0);
          }
        }
      }
    } catch (error) {
      console.error('Error checking existing onboarding:', error);
    }
  };

  const checkOnboardingStatus = async (accountId) => {
    try {
      const account = await getConnectAccountStatus(accountId);
      setOnboardingStatus(account);

      if (account.isComplete) {
        setActiveStep(2);
      } else {
        setActiveStep(1);
      }
    } catch (error) {
      console.error('Error checking onboarding status:', error);
      if (error.message.includes('Stripe Connect') || error.message.includes('platforms')) {
        setError('Stripe Connect platform not properly configured. Please ensure Connect is enabled in your Stripe dashboard.');
      } else {
        setError('Failed to check onboarding status. Please try again.');
      }
    }
  };

  const startOnboarding = async () => {
    setLoading(true);
    setError(null);

    try {
      // Create Stripe Connect account
      const account = await createConnectAccount({
        email: currentUser.email,
        firstName: currentUser.firstName,
        lastName: currentUser.lastName,
      });

      setStripeAccount(account);

      // Save account ID to user document
      await updateDoc(doc(db, 'users', currentUser.uid), {
        stripeAccountId: account.id,
        sellerOnboardingStarted: new Date(),
      });

      // Create onboarding link
      const refreshUrl = `${window.location.origin}/sell?refresh=true`;
      const returnUrl = `${window.location.origin}/sell?success=true`;

      const accountLink = await createAccountLink(account.id, refreshUrl, returnUrl);

      setActiveStep(1);

      // Open Stripe onboarding in a new tab to avoid CSP issues
      const newWindow = window.open(accountLink.url, '_blank');

      if (!newWindow) {
        // If popup was blocked, show the URL to copy
        setError(`Please allow popups or manually visit: ${accountLink.url}`);
      } else {
        // Monitor the new window
        const checkClosed = setInterval(() => {
          if (newWindow.closed) {
            clearInterval(checkClosed);
            // Refresh status after user closes the onboarding window
            setTimeout(() => {
              checkOnboardingStatus(account.id);
            }, 2000);
          }
        }, 1000);
      }

    } catch (error) {
      console.error('Error starting onboarding:', error);
      if (error.message.includes('platforms') || error.message.includes('Connect')) {
        setError('Stripe Connect setup incomplete. Please configure Connect in your Stripe dashboard first: https://dashboard.stripe.com/connect/settings');
      } else {
        setError(error.message || 'Failed to start seller registration');
      }
    } finally {
      setLoading(false);
    }
  };

  const refreshOnboarding = async () => {
    if (!stripeAccount?.id) return;

    setLoading(true);
    try {
      const refreshUrl = `${window.location.origin}/sell?refresh=true`;
      const returnUrl = `${window.location.origin}/sell?success=true`;

      const accountLink = await createAccountLink(stripeAccount.id, refreshUrl, returnUrl);

      // Open in new tab instead of redirecting
      const newWindow = window.open(accountLink.url, '_blank');

      if (!newWindow) {
        setError(`Please allow popups or manually visit: ${accountLink.url}`);
      }
    } catch (error) {
      console.error('Error refreshing onboarding:', error);
      setError('Failed to refresh onboarding link');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = () => {
    if (onComplete) {
      onComplete();
    }
    onClose();
  };

  const getStatusColor = () => {
    if (!onboardingStatus) return 'default';
    if (onboardingStatus.isComplete) {
      return 'success';
    }
    if (onboardingStatus.details_submitted) {
      return 'warning';
    }
    return 'error';
  };

  const getStatusText = () => {
    if (!onboardingStatus) return 'Not Started';
    if (onboardingStatus.isComplete) {
      return 'Verified';
    }
    if (onboardingStatus.details_submitted) {
      return 'Under Review';
    }
    return 'Incomplete';
  };

  const isComplete = onboardingStatus?.isComplete;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Typography variant="h5" component="div">
          Become a Seller
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Register with Stripe to start selling cubes on WeCube
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mb: 4 }}>
          <Stepper activeStep={activeStep} alternativeLabel>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} icon={<ErrorOutline />}>
            {error}
          </Alert>
        )}

        {activeStep === 0 && (
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <Info color="primary" sx={{ fontSize: 48, mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                Ready to Start Selling?
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                To sell cubes on WeCube, you'll need to complete a quick registration
                with Stripe, our payment processor. This ensures secure payments and
                helps us comply with financial regulations.
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                The process takes just a few minutes and you'll need:
                <br />
                • Your Social Security number or Tax ID
                <br />
                • A valid bank account for payouts
                <br />
                • Your business or personal address
              </Typography>
              <Button
                variant="contained"
                size="large"
                onClick={startOnboarding}
                disabled={loading}
                startIcon={loading && <CircularProgress size={20} />}
              >
                {loading ? 'Starting...' : 'Start Seller Registration'}
              </Button>
            </CardContent>
          </Card>
        )}

        {activeStep === 1 && (
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <Info color="primary" sx={{ fontSize: 48, mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                Complete Your Stripe Onboarding
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                A new tab should have opened with Stripe's onboarding form.
                Complete the form and then return here to continue.
              </Typography>
              {onboardingStatus && (
                <Stack direction="row" spacing={1} justifyContent="center" sx={{ mb: 3 }}>
                  <Chip
                    label={getStatusText()}
                    color={getStatusColor()}
                    icon={isComplete ? <CheckCircle /> : <ErrorOutline />}
                  />
                </Stack>
              )}
              <Stack spacing={2}>
                <Button
                  variant="contained"
                  onClick={() => checkOnboardingStatus(stripeAccount?.id)}
                  disabled={loading || !stripeAccount?.id}
                  startIcon={loading && <CircularProgress size={20} />}
                >
                  {loading ? 'Checking...' : 'Check Status'}
                </Button>
                <Button
                  variant="outlined"
                  onClick={refreshOnboarding}
                  disabled={loading}
                  startIcon={loading && <CircularProgress size={20} />}
                >
                  {loading ? 'Loading...' : 'Open Onboarding Again'}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        )}

        {activeStep === 2 && (
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <CheckCircle color="success" sx={{ fontSize: 48, mb: 2 }} />
              <Typography variant="h6" gutterBottom color="success.main">
                Seller Registration Complete!
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                Congratulations! Your seller account has been verified and you can now
                start listing cubes for sale on WeCube.
              </Typography>
              <Stack direction="row" spacing={1} justifyContent="center" sx={{ mb: 3 }}>
                <Chip
                  label="Account Verified"
                  color="success"
                  icon={<CheckCircle />}
                />
              </Stack>
              <Button
                variant="contained"
                size="large"
                onClick={handleComplete}
              >
                Start Selling
              </Button>
            </CardContent>
          </Card>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>
          {isComplete ? 'Close' : 'Cancel'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}