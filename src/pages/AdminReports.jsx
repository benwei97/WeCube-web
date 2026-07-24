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
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../contexts/useAuth";

const ADMIN_PAGE_SX = {
  width: { xs: "100%", md: "80vw" },
  maxWidth: 1180,
  mx: "auto",
  p: { xs: 1.5, sm: 2.5, md: 3 },
  mt: 2,
};

const REPORT_REASON_LABELS = {
  inappropriate_image: "Inappropriate image",
  fake_or_misleading: "Fake or misleading listing",
  scam_or_unsafe: "Scam or unsafe behavior",
  harassment_or_hate: "Harassment or hate",
  prohibited_item: "Prohibited item",
  other: "Other",
};

function formatTimestamp(value) {
  if (!value) return "Unknown";
  const date = value.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

function getReportReasonLabel(reason) {
  return REPORT_REASON_LABELS[reason] || reason || "Report";
}

export default function AdminReports() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState("");
  const [confirmAction, setConfirmAction] = useState(null);

  useEffect(() => {
    if (!currentUser?.isAdmin) {
      setLoading(false);
      return undefined;
    }

    const reportsQuery = query(
      collection(db, "listingReports"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      reportsQuery,
      (snapshot) => {
        setReports(
          snapshot.docs.map((reportDoc) => ({
            id: reportDoc.id,
            ...reportDoc.data(),
          }))
        );
        setLoading(false);
      },
      (error) => {
        console.error("Error loading listing reports:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser?.isAdmin]);

  const openReports = useMemo(
    () => reports.filter((report) => report.status === "open"),
    [reports]
  );

  const updateReportStatus = async (report, status, actionTaken) => {
    if (!currentUser?.uid) return;

    setActionLoadingId(report.id);
    try {
      const now = new Date();
      await updateDoc(doc(db, "listingReports", report.id), {
        status,
        actionTaken,
        reviewedBy: currentUser.uid,
        reviewedAt: now,
        updatedAt: now,
      });
    } catch (error) {
      console.error("Error updating report:", error);
      alert("Unable to update this report right now.");
    } finally {
      setActionLoadingId("");
    }
  };

  const hideReportedListing = async (report) => {
    if (!report || !currentUser?.uid) return;

    setActionLoadingId(report.id);
    try {
      const now = new Date();
      await updateDoc(doc(db, "listings", report.listingId), {
        moderationStatus: "hidden",
        hiddenAt: now,
        hiddenBy: currentUser.uid,
        hiddenReason: report.reason,
        updatedAt: now,
      });
      await updateReportStatus(report, "reviewed", "listing_hidden");
    } catch (error) {
      console.error("Error hiding listing:", error);
      alert("Unable to hide this listing right now.");
    } finally {
      setActionLoadingId("");
    }
  };

  const confirmActionCopy = useMemo(() => {
    if (!confirmAction?.report) return null;

    const listingTitle = confirmAction.report.listingTitle || "this listing";

    if (confirmAction.type === "hide") {
      return {
        title: "Hide Listing",
        body: `Hide "${listingTitle}" from public listing surfaces? The owner and admins may still be able to view it.`,
        confirmLabel: "Hide Listing",
        color: "error",
      };
    }

    if (confirmAction.type === "review") {
      return {
        title: "Mark Report Reviewed",
        body: `Close the report for "${listingTitle}" without changing the listing?`,
        confirmLabel: "Mark Reviewed",
        color: "primary",
      };
    }

    return null;
  }, [confirmAction]);

  const handleConfirmedAction = async () => {
    if (!confirmAction?.report) return;

    const { report, type } = confirmAction;

    if (type === "hide") {
      await hideReportedListing(report);
    } else if (type === "review") {
      await updateReportStatus(report, "reviewed", "reviewed_no_listing_change");
    }

    setConfirmAction(null);
  };

  if (!currentUser?.isAdmin) {
    return (
      <Box sx={ADMIN_PAGE_SX}>
        <Typography variant="h4" fontWeight={700} sx={{ mb: 2 }}>
          Admin Reports
        </Typography>
        <Alert severity="info">You do not have access to this page.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={ADMIN_PAGE_SX}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h3" component="h1" fontWeight={700}>
            Reports
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {openReports.length} open report{openReports.length === 1 ? "" : "s"}
          </Typography>
        </Box>

        {loading ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <CircularProgress size={20} />
            <Typography variant="body2">Loading reports...</Typography>
          </Stack>
        ) : reports.length === 0 ? (
          <Alert severity="success">No listing reports yet.</Alert>
        ) : (
          <Stack spacing={1.5}>
            {reports.map((report) => {
              const isLoading = actionLoadingId === report.id;

              return (
                <Card key={report.id} variant="outlined">
                  <CardContent>
                    <Stack spacing={1.5}>
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1}
                        justifyContent="space-between"
                        alignItems={{ xs: "flex-start", sm: "center" }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="h6" fontWeight={700}>
                            {report.listingTitle || "Reported listing"}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Reported {formatTimestamp(report.createdAt)}
                          </Typography>
                        </Box>
                        <Chip
                          label={report.status || "open"}
                          color={report.status === "open" ? "success" : "default"}
                          size="small"
                          sx={{ borderRadius: 1, textTransform: "capitalize" }}
                        />
                      </Stack>

                      <Box
                        sx={{
                          border: "1px solid",
                          borderColor: "divider",
                          borderRadius: 1,
                          p: 1.5,
                          bgcolor: "grey.50",
                        }}
                      >
                        <Stack spacing={1}>
                          <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={0.5}
                            justifyContent="space-between"
                          >
                            <Typography variant="body2" fontWeight={700}>
                              {getReportReasonLabel(report.reason)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Reporter: {report.reporterName || report.reporterId}
                            </Typography>
                          </Stack>
                          {report.details ? (
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{ whiteSpace: "pre-wrap" }}
                            >
                              {report.details}
                            </Typography>
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              No additional details provided.
                            </Typography>
                          )}
                        </Stack>
                      </Box>

                      <Stack
                        direction={{ xs: "column", md: "row" }}
                        spacing={1.25}
                        justifyContent="space-between"
                        alignItems={{ xs: "stretch", md: "center" }}
                      >
                        <Button
                          variant="contained"
                          onClick={() => navigate(`/listing/${report.listingId}`)}
                          sx={{ alignSelf: { xs: "stretch", md: "flex-start" } }}
                        >
                          View Listing
                        </Button>
                        {report.status === "open" && (
                          <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={1}
                            flexWrap="wrap"
                            useFlexGap
                            alignItems={{ xs: "stretch", sm: "center" }}
                          >
                            <Button
                              size="small"
                              variant="contained"
                              color="error"
                              disabled={isLoading}
                              onClick={() =>
                                setConfirmAction({ type: "hide", report })
                              }
                            >
                              Hide Listing
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              disabled={isLoading}
                              onClick={() =>
                                setConfirmAction({ type: "review", report })
                              }
                            >
                              Mark Reviewed
                            </Button>
                          </Stack>
                        )}
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
          </Stack>
        )}
      </Stack>

      <Dialog
        open={Boolean(confirmAction)}
        onClose={() => setConfirmAction(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{confirmActionCopy?.title || "Confirm Action"}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirmActionCopy?.body}
          </DialogContentText>
          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" color="text.secondary">
            This will update the report record immediately.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmAction(null)}
            color="inherit"
            disabled={Boolean(actionLoadingId)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmedAction}
            color={confirmActionCopy?.color || "primary"}
            variant="contained"
            disabled={Boolean(actionLoadingId)}
          >
            {confirmActionCopy?.confirmLabel || "Confirm"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
