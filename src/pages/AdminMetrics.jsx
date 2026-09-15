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
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";
import AssessmentIcon from "@mui/icons-material/Assessment";
import GroupsIcon from "@mui/icons-material/Groups";
import HandshakeIcon from "@mui/icons-material/Handshake";
import PaidIcon from "@mui/icons-material/Paid";
import ReviewsIcon from "@mui/icons-material/Reviews";
import ShareIcon from "@mui/icons-material/Share";
import StorefrontIcon from "@mui/icons-material/Storefront";
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

const getAdminMetrics = httpsCallable(functions, "getAdminMetrics");

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value) || 0);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(Number(value) || 0);
}

function formatGeneratedAt(value) {
  if (!value) return "Not loaded yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

function progressPercent(current, target) {
  if (!target) return 0;
  return Math.min(100, Math.round((current / target) * 100));
}

function MetricCard({ icon, label, value, detail }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 3, height: "100%" }}>
      <CardContent>
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} alignItems="center">
            {icon}
            <Typography variant="body2" color="text.secondary">
              {label}
            </Typography>
          </Stack>
          <Typography variant="h4" fontWeight={800}>
            {value}
          </Typography>
          {detail ? (
            <Typography variant="body2" color="text.secondary">
              {detail}
            </Typography>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

function GoalCard({ label, current, target, formatter = formatNumber, note }) {
  const percent = progressPercent(current, target);

  return (
    <Card variant="outlined" sx={{ borderRadius: 3, height: "100%" }}>
      <CardContent>
        <Stack spacing={1.25}>
          <Stack direction="row" justifyContent="space-between" gap={2}>
            <Typography variant="subtitle1" fontWeight={800}>
              {label}
            </Typography>
            <Chip
              label={`${percent}%`}
              color={percent >= 100 ? "success" : "primary"}
              size="small"
              variant={percent >= 100 ? "filled" : "outlined"}
            />
          </Stack>
          <Typography variant="h5" fontWeight={800}>
            {formatter(current)} / {formatter(target)}
          </Typography>
          <LinearProgress
            value={percent}
            variant="determinate"
            sx={{ borderRadius: 999, height: 8 }}
          />
          {note ? (
            <Typography variant="body2" color="text.secondary">
              {note}
            </Typography>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

function MetricGrid({ children }) {
  return (
    <Box
      sx={{
        display: "grid",
        gap: 2,
        gridTemplateColumns: {
          xs: "1fr",
          sm: "repeat(2, minmax(0, 1fr))",
          lg: "repeat(4, minmax(0, 1fr))",
        },
      }}
    >
      {children}
    </Box>
  );
}

export default function AdminMetrics() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadMetrics() {
    if (!currentUser?.isAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await getAdminMetrics();
      setMetrics(result.data);
    } catch (loadError) {
      console.error("Error loading admin metrics:", loadError);
      setError("Unable to load admin metrics.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.isAdmin]);

  const goals = useMemo(() => metrics?.goals || {}, [metrics?.goals]);
  const marketplace = useMemo(
    () => metrics?.marketplace || {},
    [metrics?.marketplace]
  );
  const revenueNeedsTracking = goals.lifetimeRevenue?.source === "not_configured";
  const organicNeedsTracking = goals.organicSignals?.source === "not_configured";

  const coreProductDone = useMemo(() => {
    if (!marketplace.listings) return false;
    return (
      marketplace.listings.total > 0 &&
      marketplace.messaging?.conversations > 0 &&
      marketplace.messaging?.messages > 0 &&
      marketplace.trust?.reviews > 0 &&
      marketplace.transactions?.completed > 0
    );
  }, [marketplace]);

  if (!currentUser?.isAdmin) {
    return (
      <Box sx={ADMIN_PAGE_SX}>
        <Typography variant="h4" fontWeight={800} sx={{ mb: 2 }}>
          Admin Metrics
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
              Metrics
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Last generated {formatGeneratedAt(metrics?.generatedAt)}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={() => navigate("/admin/affiliates")}>
              Affiliates
            </Button>
            <Button variant="outlined" onClick={() => navigate("/admin/reports")}>
              Reports
            </Button>
            <Button variant="contained" onClick={loadMetrics} disabled={loading}>
              Refresh
            </Button>
          </Stack>
        </Stack>

        {loading ? (
          <Stack direction="row" spacing={1.5} alignItems="center">
            <CircularProgress size={22} />
            <Typography variant="body2">Loading metrics...</Typography>
          </Stack>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : metrics ? (
          <>
            <Box>
              <Typography variant="h5" fontWeight={800} sx={{ mb: 1.5 }}>
                Founder Goals
              </Typography>
              <MetricGrid>
                <GoalCard
                  label="Real users"
                  current={goals.realUsers?.current}
                  target={goals.realUsers?.target}
                  note="Non-deleted, non-admin users with marketplace activity."
                />
                <GoalCard
                  label="Completed transactions"
                  current={goals.transactions?.current}
                  target={goals.transactions?.target}
                  note="Sold listings."
                />
                <GoalCard
                  label="Cube value moved"
                  current={goals.gmv?.current}
                  target={goals.gmv?.target}
                  formatter={formatCurrency}
                  note="Estimated from sold listing prices."
                />
                <GoalCard
                  label="Repeat transaction users"
                  current={goals.repeatTransactionUsers?.current}
                  target={goals.repeatTransactionUsers?.target}
                  note="Users with 2+ sales or purchases."
                />
                <GoalCard
                  label="Lifetime revenue"
                  current={goals.lifetimeRevenue?.current}
                  target={goals.lifetimeRevenue?.target}
                  formatter={formatCurrency}
                  note={
                    revenueNeedsTracking
                      ? "Needs revenueEvents data to track automatically."
                      : "Tracked from revenueEvents."
                  }
                />
                <GoalCard
                  label="Organic traction"
                  current={goals.organicSignals?.current}
                  target={goals.organicSignals?.target}
                  note={
                    organicNeedsTracking
                      ? "Needs referral/share tracking to measure cleanly."
                      : "Tracked from referral/share signals."
                  }
                />
                <Card variant="outlined" sx={{ borderRadius: 3 }}>
                  <CardContent>
                    <Stack spacing={1.25}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <AssessmentIcon color="primary" />
                        <Typography variant="subtitle1" fontWeight={800}>
                          Core product
                        </Typography>
                      </Stack>
                      <Chip
                        label={coreProductDone ? "Signals present" : "Still measuring"}
                        color={coreProductDone ? "success" : "default"}
                        sx={{ alignSelf: "flex-start" }}
                      />
                      <Typography variant="body2" color="text.secondary">
                        Checks listings, messaging, reviews, and sold activity.
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              </MetricGrid>
            </Box>

            <Box>
              <Typography variant="h5" fontWeight={800} sx={{ mb: 1.5 }}>
                Marketplace Snapshot
              </Typography>
              <MetricGrid>
                <MetricCard
                  icon={<GroupsIcon color="primary" />}
                  label="Users"
                  value={formatNumber(marketplace.users?.total)}
                  detail={`${formatNumber(marketplace.users?.real)} real, ${formatNumber(
                    marketplace.users?.deleted
                  )} deleted`}
                />
                <MetricCard
                  icon={<StorefrontIcon color="primary" />}
                  label="Listings"
                  value={formatNumber(marketplace.listings?.total)}
                  detail={`${formatNumber(marketplace.listings?.active)} active, ${formatNumber(
                    marketplace.listings?.sold
                  )} sold`}
                />
                <MetricCard
                  icon={<HandshakeIcon color="primary" />}
                  label="Transactions"
                  value={formatNumber(marketplace.transactions?.completed)}
                  detail={`${formatCurrency(
                    marketplace.transactions?.estimatedGmv
                  )} estimated value`}
                />
                <MetricCard
                  icon={<PaidIcon color="primary" />}
                  label="Revenue"
                  value={formatCurrency(marketplace.revenue?.lifetime)}
                  detail={`${formatNumber(marketplace.revenue?.events)} tracked event${
                    marketplace.revenue?.events === 1 ? "" : "s"
                  }`}
                />
                <MetricCard
                  icon={<ShareIcon color="primary" />}
                  label="Affiliates"
                  value={formatCurrency(marketplace.affiliates?.pendingPayout)}
                  detail={`${formatNumber(marketplace.affiliates?.total)} affiliate records, ${formatCurrency(
                    marketplace.affiliates?.paidPayout
                  )} paid`}
                />
                <MetricCard
                  icon={<AssessmentIcon color="primary" />}
                  label="Messages"
                  value={formatNumber(marketplace.messaging?.messages)}
                  detail={`${formatNumber(
                    marketplace.messaging?.conversations
                  )} conversations`}
                />
                <MetricCard
                  icon={<ReviewsIcon color="primary" />}
                  label="Trust"
                  value={formatNumber(marketplace.trust?.reviews)}
                  detail={`${formatNumber(marketplace.trust?.reports)} reports, ${formatNumber(
                    marketplace.trust?.openReports
                  )} open`}
                />
                <MetricCard
                  icon={<ShareIcon color="primary" />}
                  label="Engagement"
                  value={formatNumber(marketplace.engagement?.savedListings)}
                  detail={`${formatNumber(
                    marketplace.engagement?.savedCompetitions
                  )} saved competitions`}
                />
                <MetricCard
                  icon={<GroupsIcon color="primary" />}
                  label="Repeat users"
                  value={formatNumber(marketplace.transactions?.repeatUsers)}
                  detail={`${formatNumber(
                    marketplace.transactions?.uniqueSellers
                  )} sellers, ${formatNumber(marketplace.transactions?.uniqueBuyers)} buyers`}
                />
              </MetricGrid>
            </Box>
          </>
        ) : null}
      </Stack>
    </Box>
  );
}
