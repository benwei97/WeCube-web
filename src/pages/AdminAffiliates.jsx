import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../firebase";
import { useAuth } from "../contexts/useAuth";

const ADMIN_PAGE_SX = {
  width: { xs: "100%", md: "82vw" },
  maxWidth: 1220,
  mx: "auto",
  p: { xs: 1.5, sm: 2.5, md: 3 },
  mt: 2,
};

const getAdminAffiliates = httpsCallable(functions, "getAdminAffiliates");
const saveAffiliate = httpsCallable(functions, "saveAffiliate");
const markAffiliateEventsPaid = httpsCallable(functions, "markAffiliateEventsPaid");

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "Unknown";
  const date =
    typeof value.seconds === "number"
      ? new Date(value.seconds * 1000)
      : value.toDate
        ? value.toDate()
        : new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

function getAffiliateUrl(code) {
  return `https://wecube.app/?ref=${encodeURIComponent(code)}`;
}

function Stat({ label, value }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6" fontWeight={800}>
        {value}
      </Typography>
    </Box>
  );
}

export default function AdminAffiliates() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [payingAffiliateId, setPayingAffiliateId] = useState("");
  const [notice, setNotice] = useState(null);
  const [form, setForm] = useState({
    code: "",
    displayName: "",
    userId: "",
    status: "active",
  });

  async function loadAffiliates() {
    if (!currentUser?.isAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      const result = await getAdminAffiliates();
      setData(result.data);
    } catch (error) {
      console.error("Error loading affiliates:", error);
      setNotice({
        severity: "error",
        message: "Unable to load affiliates.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAffiliates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.isAdmin]);

  const affiliates = data?.affiliates || [];
  const events = data?.events || [];
  const totals = useMemo(() => data?.totals || {}, [data?.totals]);

  async function handleSaveAffiliate(event) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);

    try {
      await saveAffiliate({
        code: form.code,
        displayName: form.displayName,
        userId: form.userId,
        status: form.status,
      });
      setForm({
        code: "",
        displayName: "",
        userId: "",
        status: "active",
      });
      setNotice({
        severity: "success",
        message: "Affiliate saved.",
      });
      await loadAffiliates();
    } catch (error) {
      console.error("Error saving affiliate:", error);
      setNotice({
        severity: "error",
        message: error.message || "Unable to save affiliate.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkPaid(affiliateId) {
    setPayingAffiliateId(affiliateId);
    setNotice(null);

    try {
      const result = await markAffiliateEventsPaid({ affiliateId });
      setNotice({
        severity: "success",
        message: `Marked ${result.data.updated} event${
          result.data.updated === 1 ? "" : "s"
        } paid.`,
      });
      await loadAffiliates();
    } catch (error) {
      console.error("Error marking affiliate paid:", error);
      setNotice({
        severity: "error",
        message: "Unable to mark affiliate events paid.",
      });
    } finally {
      setPayingAffiliateId("");
    }
  }

  async function copyAffiliateLink(code) {
    try {
      await navigator.clipboard.writeText(getAffiliateUrl(code));
      setNotice({
        severity: "success",
        message: "Affiliate link copied.",
      });
    } catch (error) {
      console.error("Error copying affiliate link:", error);
      setNotice({
        severity: "info",
        message: getAffiliateUrl(code),
      });
    }
  }

  function editAffiliate(affiliate) {
    setForm({
      code: affiliate.code || affiliate.id,
      displayName: affiliate.displayName || "",
      userId: affiliate.userId || "",
      status: affiliate.status || "active",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!currentUser?.isAdmin) {
    return (
      <Box sx={ADMIN_PAGE_SX}>
        <Typography variant="h4" fontWeight={800} sx={{ mb: 2 }}>
          Admin Affiliates
        </Typography>
        <Alert severity="info">You do not have access to this page.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={ADMIN_PAGE_SX}>
      <Stack spacing={3}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          gap={2}
        >
          <Box>
            <Typography variant="h3" component="h1" fontWeight={800}>
              Affiliates
            </Typography>
            <Typography variant="body2" color="text.secondary">
              $1 per activated referred user and $3 for their first transaction.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={() => navigate("/admin/metrics")}>
              Metrics
            </Button>
            <Button variant="outlined" onClick={() => navigate("/admin/reports")}>
              Reports
            </Button>
          </Stack>
        </Stack>

        {notice ? <Alert severity={notice.severity}>{notice.message}</Alert> : null}

        <Card variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent>
            <Stack
              component="form"
              spacing={2}
              onSubmit={handleSaveAffiliate}
            >
              <Typography variant="h6" fontWeight={800}>
                Create or edit affiliate
              </Typography>
              <Box
                sx={{
                  display: "grid",
                  gap: 2,
                  gridTemplateColumns: {
                    xs: "1fr",
                    md: "1fr 1.2fr 1.4fr 0.8fr",
                  },
                }}
              >
                <TextField
                  label="Code"
                  placeholder="jayden"
                  value={form.code}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      code: normalizeCode(event.target.value),
                    }))
                  }
                  required
                />
                <TextField
                  label="Display name"
                  placeholder="Jayden"
                  value={form.displayName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      displayName: event.target.value,
                    }))
                  }
                  required
                />
                <TextField
                  label="Linked user ID"
                  placeholder="Optional"
                  value={form.userId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      userId: event.target.value.trim(),
                    }))
                  }
                />
                <TextField
                  select
                  label="Status"
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value,
                    }))
                  }
                >
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="disabled">Disabled</MenuItem>
                </TextField>
              </Box>
              <Stack direction="row" spacing={1}>
                <Button type="submit" variant="contained" disabled={saving}>
                  {saving ? "Saving..." : "Save Affiliate"}
                </Button>
                {form.code ? (
                  <Button
                    variant="outlined"
                    onClick={() => copyAffiliateLink(form.code)}
                    type="button"
                  >
                    Copy Link
                  </Button>
                ) : null}
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(3, minmax(0, 1fr))",
            },
          }}
        >
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent>
              <Stat label="Pending payout" value={formatCurrency(totals.pendingAmount)} />
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent>
              <Stat label="Paid payout" value={formatCurrency(totals.paidAmount)} />
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent>
              <Stat label="Total events" value={totals.totalEvents || 0} />
            </CardContent>
          </Card>
        </Box>

        {loading ? (
          <Stack direction="row" spacing={1.5} alignItems="center">
            <CircularProgress size={22} />
            <Typography variant="body2">Loading affiliates...</Typography>
          </Stack>
        ) : affiliates.length === 0 ? (
          <Alert severity="info">No affiliates yet.</Alert>
        ) : (
          <Stack spacing={2}>
            {affiliates.map((affiliate) => {
              const pendingAmount = affiliate.summary?.pendingAmount || 0;
              return (
                <Card key={affiliate.id} variant="outlined" sx={{ borderRadius: 3 }}>
                  <CardContent>
                    <Stack spacing={2}>
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        justifyContent="space-between"
                        gap={1.5}
                      >
                        <Box>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="h6" fontWeight={800}>
                              {affiliate.displayName}
                            </Typography>
                            <Chip
                              label={affiliate.status}
                              color={affiliate.status === "active" ? "success" : "default"}
                              size="small"
                            />
                          </Stack>
                          <Typography variant="body2" color="text.secondary">
                            {getAffiliateUrl(affiliate.code || affiliate.id)}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={1} flexWrap="wrap">
                          <Button
                            variant="outlined"
                            onClick={() => copyAffiliateLink(affiliate.code || affiliate.id)}
                          >
                            Copy Link
                          </Button>
                          <Button variant="outlined" onClick={() => editAffiliate(affiliate)}>
                            Edit
                          </Button>
                          <Button
                            variant="contained"
                            disabled={pendingAmount <= 0 || payingAffiliateId === affiliate.id}
                            onClick={() => handleMarkPaid(affiliate.id)}
                          >
                            {payingAffiliateId === affiliate.id ? "Saving..." : "Mark Paid"}
                          </Button>
                        </Stack>
                      </Stack>
                      <Divider />
                      <Box
                        sx={{
                          display: "grid",
                          gap: 2,
                          gridTemplateColumns: {
                            xs: "repeat(2, minmax(0, 1fr))",
                            md: "repeat(6, minmax(0, 1fr))",
                          },
                        }}
                      >
                        <Stat label="Signups" value={affiliate.summary?.signups || 0} />
                        <Stat
                          label="Activated"
                          value={affiliate.summary?.activatedUsers || 0}
                        />
                        <Stat
                          label="Transactions"
                          value={affiliate.summary?.firstTransactions || 0}
                        />
                        <Stat
                          label="Pending"
                          value={formatCurrency(affiliate.summary?.pendingAmount)}
                        />
                        <Stat
                          label="Paid"
                          value={formatCurrency(affiliate.summary?.paidAmount)}
                        />
                        <Stat
                          label="Total"
                          value={formatCurrency(affiliate.summary?.totalAmount)}
                        />
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
          </Stack>
        )}

        <Box>
          <Typography variant="h5" fontWeight={800} sx={{ mb: 1.5 }}>
            Recent events
          </Typography>
          {events.length === 0 ? (
            <Alert severity="info">No affiliate events yet.</Alert>
          ) : (
            <Stack spacing={1.25}>
              {events.map((event) => (
                <Card key={event.id} variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      justifyContent="space-between"
                      gap={1}
                    >
                      <Box>
                        <Typography variant="subtitle2" fontWeight={800}>
                          {event.affiliateCode || event.affiliateId} earned{" "}
                          {formatCurrency(event.amount)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {event.type} for {event.referredUserName || event.referredUserId}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip
                          label={event.status}
                          color={event.status === "pending" ? "warning" : "success"}
                          size="small"
                        />
                        <Typography variant="body2" color="text.secondary">
                          {formatDate(event.createdAt)}
                        </Typography>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </Box>
      </Stack>
    </Box>
  );
}
