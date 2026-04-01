import { loadStripe } from "@stripe/stripe-js";

// Initialize Stripe with publishable key and CSP-friendly options
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY, {
  // Disable some features that might cause CSP issues in development
  advancedFraudSignals: false,
});

export default stripePromise;

// Stripe secret key for server-side operations (store securely in production)
export const STRIPE_SECRET_KEY = import.meta.env.VITE_STRIPE_SECRET_KEY;

/**
 * Create a test-friendly Connect account for development
 */
export async function createConnectAccount(userInfo) {
  try {
    // For test mode, create a minimal Express account with test data
    const response = await fetch("https://api.stripe.com/v1/accounts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        type: "express",
        country: "US",
        email: userInfo.email,
        "capabilities[card_payments][requested]": "true",
        "capabilities[transfers][requested]": "true",
        business_type: "individual",
        // Use test-friendly data
        "individual[email]": userInfo.email,
        "individual[first_name]": "Test",
        "individual[last_name]": "Seller",
        "individual[address][line1]": "address_full_match",
        "individual[address][city]": "New York",
        "individual[address][state]": "NY",
        "individual[address][postal_code]": "10001",
        "individual[phone]": "+15555551234",
        "individual[dob][day]": "1",
        "individual[dob][month]": "1",
        "individual[dob][year]": "1901",
        "individual[ssn_last_4]": "0000",
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Failed to create Connect account");
    }

    const account = await response.json();
    return account;
  } catch (error) {
    console.error("Error creating Connect account:", error);
    throw error;
  }
}

/**
 * Create account link for Express onboarding
 */
export async function createAccountLink(accountId, refreshUrl, returnUrl) {
  try {
    const response = await fetch("https://api.stripe.com/v1/account_links", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: "account_onboarding",
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Failed to create account link");
    }

    const accountLink = await response.json();
    return accountLink;
  } catch (error) {
    console.error("Error creating account link:", error);
    throw error;
  }
}

/**
 * Retrieve Connect account details and onboarding status
 */
export async function getConnectAccountStatus(accountId) {
  try {
    const response = await fetch(`https://api.stripe.com/v1/accounts/${accountId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Failed to retrieve account details");
    }

    const account = await response.json();

    return {
      id: account.id,
      charges_enabled: account.charges_enabled,
      details_submitted: account.details_submitted,
      payouts_enabled: account.payouts_enabled,
      requirements: account.requirements,
      isComplete: account.charges_enabled && account.details_submitted && account.payouts_enabled
    };
  } catch (error) {
    console.error("Error retrieving account details:", error);
    throw error;
  }
}

/**
 * Create payment intent for marketplace payment (simplified approach)
 */
export async function createMarketplacePaymentIntent(
  amount,
  connectedAccountId,
  currency = "usd",
  metadata = {}
) {
  try {
    // For simplicity, just create a regular payment intent
    // The fee will be handled separately after payment succeeds
    const totalAmount = Math.round(amount * 100); // Total amount in cents

    const params = {
      amount: totalAmount,
      currency: currency,
      "automatic_payment_methods[enabled]": "true",
    };

    // Add metadata parameters including connected account info
    Object.keys(metadata).forEach(key => {
      params[`metadata[${key}]`] = metadata[key];
    });
    params[`metadata[connected_account]`] = connectedAccountId;

    const response = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.error?.message || "Failed to create payment intent"
      );
    }

    const paymentIntent = await response.json();
    return paymentIntent;
  } catch (error) {
    console.error("Error creating marketplace payment intent:", error);
    throw error;
  }
}

/**
 * Confirm a payment intent
 */
export async function confirmPayment(stripe, clientSecret, paymentMethodData) {
  try {
    const result = await stripe.confirmPayment({
      clientSecret,
      confirmParams: paymentMethodData,
      redirect: "if_required",
    });

    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.paymentIntent;
  } catch (error) {
    console.error("Error confirming payment:", error);
    throw error;
  }
}

/**
 * Format price for display
 */
export function formatPrice(amount, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
  }).format(amount);
}

/**
 * Calculate platform fee (5% for marketplace)
 */
export function calculatePlatformFee(amount, feePercentage = 0.05) {
  return Math.round(amount * feePercentage * 100) / 100;
}

/**
 * Calculate total amount including fees
 */
export function calculateTotalAmount(listingPrice, platformFeePercentage = 0.05) {
  const platformFee = calculatePlatformFee(listingPrice, platformFeePercentage);
  return {
    listingPrice,
    platformFee,
    totalAmount: listingPrice + platformFee,
  };
}

/**
 * Add funds to platform account for testing transfers
 */
export async function addTestFunds(amount = 100) {
  try {
    const response = await fetch("https://api.stripe.com/v1/charges", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        amount: Math.round(amount * 100),
        currency: "usd",
        source: "4000000000000077", // Special test card for adding funds
        description: "Test funds for transfers",
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Failed to add test funds");
    }

    const charge = await response.json();
    console.log(`Added $${amount} test funds to platform account`);
    return charge;
  } catch (error) {
    console.error("Error adding test funds:", error);
    throw error;
  }
}

/**
 * Transfer funds to connected account after successful payment
 */
export async function transferToSeller(paymentIntentId, connectedAccountId, amount) {
  try {
    const transferAmount = Math.round(amount * 0.95 * 100); // 95% to seller (5% platform fee)

    const response = await fetch("https://api.stripe.com/v1/transfers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        amount: transferAmount,
        currency: "usd",
        destination: connectedAccountId,
        "metadata[payment_intent]": paymentIntentId,
      }),
    });

    if (!response.ok) {
      const error = await response.json();

      // If insufficient funds, try to add test funds and retry
      if (error.error?.code === 'insufficient_funds' && isTestMode()) {
        console.log('Insufficient funds detected, adding test funds...');
        await addTestFunds(Math.ceil(amount)); // Add enough funds

        // Retry the transfer
        const retryResponse = await fetch("https://api.stripe.com/v1/transfers", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            amount: transferAmount,
            currency: "usd",
            destination: connectedAccountId,
            "metadata[payment_intent]": paymentIntentId,
          }),
        });

        if (!retryResponse.ok) {
          const retryError = await retryResponse.json();
          throw new Error(retryError.error?.message || "Failed to transfer after adding funds");
        }

        const transfer = await retryResponse.json();
        return transfer;
      } else {
        throw new Error(error.error?.message || "Failed to transfer to seller");
      }
    }

    const transfer = await response.json();
    return transfer;
  } catch (error) {
    console.error("Error transferring to seller:", error);
    throw error;
  }
}

/**
 * Check if we're in test mode
 */
function isTestMode() {
  return STRIPE_SECRET_KEY?.includes('sk_test_');
}