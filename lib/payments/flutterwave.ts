import { CURRENCY } from "./plans";

// Client wrapper around Flutterwave's v3 API (test mode). No business logic
// here — just the transport: initiate a checkout and verify a transaction
// server-side. Amounts ride the wire as stringified minor units (R2.1).

const API_BASE = "https://api.flutterwave.com/v3";

export interface FlutterwaveCustomer {
  email: string;
  name: string;
  phonenumber?: string;
}

export interface InitiateCheckoutParams {
  txRef: string;
  amountMinor: number;
  customer: FlutterwaveCustomer;
  redirectUrl: string;
  currency?: string;
}

export interface InitiateCheckoutResult {
  checkoutUrl: string;
  txRef: string;
}

export interface VerifiedTransaction {
  providerId: number;
  providerTxRef: string;
  status: string;
  amountMinor: number;
  currency: string;
}

function authHeaders(): Record<string, string> {
  const secret = process.env.FLW_SECRET_KEY;
  if (!secret) {
    throw new Error("FLW_SECRET_KEY is not set");
  }
  return {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };
}

export async function initiateCheckout(
  params: InitiateCheckoutParams
): Promise<InitiateCheckoutResult> {
  const res = await fetch(`${API_BASE}/payments`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      tx_ref: params.txRef,
      // Flutterwave expects the amount in the currency's MAJOR unit (naira), not
      // the minor units (kobo) we store internally (R2.1). Convert to major units
      // ONLY for this outbound call; storage and the payment log stay minor.
      amount: String(params.amountMinor / 100),
      currency: params.currency ?? CURRENCY,
      redirect_url: params.redirectUrl,
      customer: params.customer,
      customizations: { title: "Provly", description: "Provly Pro subscription" },
    }),
  });

  const payload = (await res.json()) as {
    status?: string;
    message?: string;
    data?: { link?: string; tx_ref?: string };
  };

  if (!res.ok || payload.status !== "success" || !payload.data?.link) {
    throw new Error(payload.message ?? "Flutterwave checkout initiation failed");
  }

  return {
    checkoutUrl: payload.data.link,
    txRef: payload.data.tx_ref ?? params.txRef,
  };
}

// DEV/TEST ONLY seam: lets the payment flow be exercised locally without a real
// Flutterwave transaction. It is hard-gated so it can never run in production
// (NODE_ENV must not be "production") AND the explicit flag must be set. With
// real keys and no flag, the real verify call runs unchanged.
function mockVerifyEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.FLW_VERIFY_MOCK === "true";
}

function mockAmountMinor(): number {
  return Number(process.env.FLW_MOCK_AMOUNT_MINOR ?? "300000");
}

export async function verifyTransactionByReference(
  txRef: string
): Promise<VerifiedTransaction> {
  if (mockVerifyEnabled()) {
    return { providerId: 0, providerTxRef: txRef, status: "successful", amountMinor: mockAmountMinor(), currency: CURRENCY };
  }

  const res = await fetch(`${API_BASE}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`, {
    method: "GET",
    headers: authHeaders(),
  });

  const payload = (await res.json()) as {
    status?: string;
    message?: string;
    data?: {
      id?: number;
      tx_ref?: string;
      status?: string;
      amount?: string | number;
      currency?: string;
    };
  };

  if (!res.ok || payload.status !== "success" || !payload.data) {
    throw new Error(payload.message ?? "Flutterwave verification failed");
  }

  const tx = payload.data;
  if (typeof tx.amount === "undefined") {
    throw new Error("Missing amount in Flutterwave verification response");
  }

  return {
    providerId: tx.id ?? 0,
    providerTxRef: tx.tx_ref ?? txRef,
    status: tx.status ?? "unknown",
    amountMinor: Math.round(Number(tx.amount) * 100),
    currency: tx.currency ?? CURRENCY,
  };
}

export async function verifyTransaction(transactionId: number): Promise<VerifiedTransaction> {
  if (mockVerifyEnabled()) {
    return { providerId: transactionId, providerTxRef: "", status: "successful", amountMinor: mockAmountMinor(), currency: CURRENCY };
  }

  const res = await fetch(`${API_BASE}/transactions/${transactionId}/verify`, {
    method: "GET",
    headers: authHeaders(),
  });

  const payload = (await res.json()) as {
    status?: string;
    message?: string;
    data?: {
      id?: number;
      tx_ref?: string;
      status?: string;
      amount?: string | number;
      currency?: string;
    };
  };

  if (!res.ok || payload.status !== "success" || !payload.data) {
    throw new Error(payload.message ?? "Flutterwave verification failed");
  }

  const tx = payload.data;
  if (typeof tx.amount === "undefined") {
    throw new Error("Missing amount in Flutterwave verification response");
  }

  return {
    providerId: tx.id ?? 0,
    providerTxRef: tx.tx_ref ?? "",
    status: tx.status ?? "unknown",
    amountMinor: Math.round(Number(tx.amount) * 100),
    currency: tx.currency ?? CURRENCY,
  };
}
