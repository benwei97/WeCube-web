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
  Snackbar,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import {
  collection,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
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
const USER_REPORT_REASON_LABELS = {
  scam_or_unsafe: "Scam or unsafe behavior",
  harassment_or_abuse: "Harassment or abusive behavior",
  fake_identity: "Fake identity or impersonation",
  suspicious_activity: "Suspicious listings or messages",
  other: "Other",
};
const CONVERSATION_REPORT_REASON_LABELS = {
  scam_or_unsafe: "Scam or unsafe behavior",
  harassment_or_abuse: "Harassment or abusive behavior",
  payment_or_shipping_issue: "Payment or shipping concern",
  suspicious_messages: "Suspicious messages",
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

function getUserReportReasonLabel(reason) {
  return USER_REPORT_REASON_LABELS[reason] || reason || "Report";
}

function getConversationReportReasonLabel(reason) {
  return CONVERSATION_REPORT_REASON_LABELS[reason] || reason || "Report";
}

export default function AdminReports() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [userReports, setUserReports] = useState([]);
  const [conversationReports, setConversationReports] = useState([]);
  const [hiddenListings, setHiddenListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState("");
  const [confirmAction, setConfirmAction] = useState(null);
  const [activeTab, setActiveTab] = useState("listings");
  const [actionSnackbar, setActionSnackbar] = useState(null);

  useEffect(() => {
    if (!currentUser?.isAdmin) {
      setLoading(false);
      return undefined;
    }

    let loadedListingReports = false;
    let loadedUserReports = false;
    let loadedConversationReports = false;
    let loadedHiddenListings = false;
    const markLoaded = () => {
      if (
        loadedListingReports &&
        loadedUserReports &&
        loadedConversationReports &&
        loadedHiddenListings
      ) {
        setLoading(false);
      }
    };

    const reportsQuery = query(
      collection(db, "listingReports"),
      orderBy("createdAt", "desc")
    );
    const userReportsQuery = query(
      collection(db, "userReports"),
      orderBy("createdAt", "desc")
    );
    const conversationReportsQuery = query(
      collection(db, "conversationReports"),
      orderBy("createdAt", "desc")
    );
    const hiddenListingsQuery = query(
      collection(db, "listings"),
      where("moderationStatus", "==", "hidden"),
      orderBy("hiddenAt", "desc")
    );

    const unsubscribeListingReports = onSnapshot(
      reportsQuery,
      (snapshot) => {
        setReports(
          snapshot.docs.map((reportDoc) => ({
            id: reportDoc.id,
            ...reportDoc.data(),
          }))
        );
        loadedListingReports = true;
        markLoaded();
      },
      (error) => {
        console.error("Error loading listing reports:", error);
        loadedListingReports = true;
        markLoaded();
      }
    );

    const unsubscribeUserReports = onSnapshot(
      userReportsQuery,
      (snapshot) => {
        setUserReports(
          snapshot.docs.map((reportDoc) => ({
            id: reportDoc.id,
            ...reportDoc.data(),
          }))
        );
        loadedUserReports = true;
        markLoaded();
      },
      (error) => {
        console.error("Error loading user reports:", error);
        loadedUserReports = true;
        markLoaded();
      }
    );

    const unsubscribeConversationReports = onSnapshot(
      conversationReportsQuery,
      (snapshot) => {
        setConversationReports(
          snapshot.docs.map((reportDoc) => ({
            id: reportDoc.id,
            ...reportDoc.data(),
          }))
        );
        loadedConversationReports = true;
        markLoaded();
      },
      (error) => {
        console.error("Error loading conversation reports:", error);
        loadedConversationReports = true;
        markLoaded();
      }
    );

    const unsubscribeHiddenListings = onSnapshot(
      hiddenListingsQuery,
      (snapshot) => {
        setHiddenListings(
          snapshot.docs.map((listingDoc) => ({
            id: listingDoc.id,
            ...listingDoc.data(),
          }))
        );
        loadedHiddenListings = true;
        markLoaded();
      },
      (error) => {
        console.error("Error loading hidden listings:", error);
        loadedHiddenListings = true;
        markLoaded();
      }
    );

    return () => {
      unsubscribeListingReports();
      unsubscribeUserReports();
      unsubscribeConversationReports();
      unsubscribeHiddenListings();
    };
  }, [currentUser?.isAdmin]);

  const openReports = useMemo(
    () => reports.filter((report) => report.status === "open"),
    [reports]
  );
  const openUserReports = useMemo(
    () => userReports.filter((report) => report.status === "open"),
    [userReports]
  );
  const openConversationReports = useMemo(
    () => conversationReports.filter((report) => report.status === "open"),
    [conversationReports]
  );

  const updateReportStatus = async (
    collectionName,
    report,
    status,
    actionTaken
  ) => {
    if (!currentUser?.uid) return;

    setActionLoadingId(report.id);
    try {
      const now = new Date();
      await updateDoc(doc(db, collectionName, report.id), {
        status,
        actionTaken,
        reviewedBy: currentUser.uid,
        reviewedAt: now,
        updatedAt: now,
      });
    } catch (error) {
      console.error("Error updating report:", error);
      setActionSnackbar({
        severity: "error",
        message: "Unable to update this report right now.",
      });
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
      await updateReportStatus(
        "listingReports",
        report,
        "reviewed",
        "listing_hidden"
      );
    } catch (error) {
      console.error("Error hiding listing:", error);
      setActionSnackbar({
        severity: "error",
        message: "Unable to hide this listing right now.",
      });
    } finally {
      setActionLoadingId("");
    }
  };

  const hideReportedUserListings = async (report) => {
    if (!report?.reportedUserId || !currentUser?.uid) return;

    setActionLoadingId(report.id);
    try {
      const now = new Date();
      const listingsQuery = query(
        collection(db, "listings"),
        where("userId", "==", report.reportedUserId)
      );
      const snapshot = await getDocs(listingsQuery);
      const listingsToHide = snapshot.docs.filter((listingDoc) => {
        const listing = listingDoc.data();
        return listing.status !== "sold" && listing.moderationStatus !== "hidden";
      });

      if (listingsToHide.length > 0) {
        const batch = writeBatch(db);
        listingsToHide.forEach((listingDoc) => {
          batch.update(listingDoc.ref, {
            moderationStatus: "hidden",
            hiddenAt: now,
            hiddenBy: currentUser.uid,
            hiddenReason: report.reason,
            updatedAt: now,
          });
        });
        await batch.commit();
      }

      await updateReportStatus(
        "userReports",
        report,
        "reviewed",
        "reported_user_listings_hidden"
      );
    } catch (error) {
      console.error("Error hiding reported user listings:", error);
      setActionSnackbar({
        severity: "error",
        message: "Unable to hide this user's listings right now.",
      });
    } finally {
      setActionLoadingId("");
    }
  };

  const restoreHiddenListing = async (listing) => {
    if (!listing?.id) return;

    setActionLoadingId(listing.id);
    try {
      await updateDoc(doc(db, "listings", listing.id), {
        moderationStatus: deleteField(),
        hiddenAt: deleteField(),
        hiddenBy: deleteField(),
        hiddenReason: deleteField(),
        updatedAt: new Date(),
      });
    } catch (error) {
      console.error("Error restoring hidden listing:", error);
      setActionSnackbar({
        severity: "error",
        message: "Unable to restore this listing right now.",
      });
    } finally {
      setActionLoadingId("");
    }
  };

  const confirmActionCopy = useMemo(() => {
    if (!confirmAction?.report && !confirmAction?.listing) return null;

    const reportTarget =
      confirmAction.report?.listingTitle ||
      confirmAction.report?.reportedUserName ||
      confirmAction.listing?.title ||
      "this report";

    if (confirmAction.type === "hide") {
      return {
        title: "Hide Listing",
        body: `Hide "${reportTarget}" from public listing surfaces? The owner and admins may still be able to view it.`,
        confirmLabel: "Hide Listing",
        color: "error",
      };
    }

    if (confirmAction.type === "hideUserListings") {
      return {
        title: "Hide User Listings",
        body: `Hide all active and pending listings from "${reportTarget}"? Sold listings will not be changed.`,
        confirmLabel: "Hide Listings",
        color: "error",
      };
    }

    if (
      confirmAction.type === "reviewListing" ||
      confirmAction.type === "reviewUser" ||
      confirmAction.type === "reviewConversation"
    ) {
      return {
        title: "Mark Report Reviewed",
        body: `Close the report for "${reportTarget}" without taking additional action?`,
        confirmLabel: "Mark Reviewed",
        color: "primary",
      };
    }

    if (confirmAction.type === "restoreListing") {
      return {
        title: "Restore Listing",
        body: `Restore "${reportTarget}" to public listing surfaces?`,
        confirmLabel: "Restore Listing",
        color: "primary",
      };
    }

    return null;
  }, [confirmAction]);

  const handleConfirmedAction = async () => {
    if (!confirmAction?.report && !confirmAction?.listing) return;

    const { report, listing, type } = confirmAction;

    if (type === "hide") {
      await hideReportedListing(report);
    } else if (type === "hideUserListings") {
      await hideReportedUserListings(report);
    } else if (type === "reviewListing") {
      await updateReportStatus(
        "listingReports",
        report,
        "reviewed",
        "reviewed_no_listing_change"
      );
    } else if (type === "reviewUser") {
      await updateReportStatus(
        "userReports",
        report,
        "reviewed",
        "reviewed_no_user_change"
      );
    } else if (type === "reviewConversation") {
      await updateReportStatus(
        "conversationReports",
        report,
        "reviewed",
        "reviewed_no_conversation_change"
      );
    } else if (type === "restoreListing") {
      await restoreHiddenListing(listing);
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
            {openReports.length +
              openUserReports.length +
              openConversationReports.length} open report
            {openReports.length +
              openUserReports.length +
              openConversationReports.length ===
            1
              ? ""
              : "s"}
          </Typography>
        </Box>

        <Tabs
          value={activeTab}
          onChange={(_, value) => setActiveTab(value)}
          sx={{ borderBottom: 1, borderColor: "divider" }}
        >
          <Tab
            label={`Listings (${openReports.length})`}
            value="listings"
          />
          <Tab
            label={`Users (${openUserReports.length})`}
            value="users"
          />
          <Tab
            label={`Messages (${openConversationReports.length})`}
            value="messages"
          />
          <Tab
            label={`Hidden (${hiddenListings.length})`}
            value="hidden"
          />
        </Tabs>

        {loading ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <CircularProgress size={20} />
            <Typography variant="body2">Loading reports...</Typography>
          </Stack>
        ) : activeTab === "listings" && reports.length === 0 ? (
          <Alert severity="success">No listing reports yet.</Alert>
        ) : activeTab === "users" && userReports.length === 0 ? (
          <Alert severity="success">No user reports yet.</Alert>
        ) : activeTab === "messages" && conversationReports.length === 0 ? (
          <Alert severity="success">No message reports yet.</Alert>
        ) : activeTab === "hidden" && hiddenListings.length === 0 ? (
          <Alert severity="success">No hidden listings.</Alert>
        ) : activeTab === "listings" ? (
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
                                setConfirmAction({ type: "reviewListing", report })
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
        ) : activeTab === "users" ? (
          <Stack spacing={1.5}>
            {userReports.map((report) => {
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
                            {report.reportedUserName || "Reported user"}
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
                              {getUserReportReasonLabel(report.reason)}
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
                          onClick={() => navigate(`/seller/${report.reportedUserId}`)}
                          sx={{ alignSelf: { xs: "stretch", md: "flex-start" } }}
                        >
                          View Profile
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
                                setConfirmAction({
                                  type: "hideUserListings",
                                  report,
                                })
                              }
                            >
                              Hide User Listings
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              disabled={isLoading}
                              onClick={() =>
                                setConfirmAction({ type: "reviewUser", report })
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
        ) : activeTab === "messages" ? (
          <Stack spacing={1.5}>
            {conversationReports.map((report) => {
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
                            {report.reportedUserName || "Reported user"}
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
                              {getConversationReportReasonLabel(report.reason)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Reporter: {report.reporterName || report.reporterId}
                            </Typography>
                          </Stack>
                          {report.listingTitle && (
                            <Typography variant="caption" color="text.secondary">
                              Listing: {report.listingTitle}
                            </Typography>
                          )}
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
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                          <Button
                            variant="contained"
                            onClick={() =>
                              navigate(`/messages/${report.conversationId}`)
                            }
                          >
                            View Conversation
                          </Button>
                          <Button
                            variant="outlined"
                            onClick={() =>
                              navigate(`/seller/${report.reportedUserId}`)
                            }
                          >
                            View Profile
                          </Button>
                        </Stack>
                        {report.status === "open" && (
                          <Button
                            size="small"
                            variant="outlined"
                            disabled={isLoading}
                            onClick={() =>
                              setConfirmAction({
                                type: "reviewConversation",
                                report,
                              })
                            }
                          >
                            Mark Reviewed
                          </Button>
                        )}
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
          </Stack>
        ) : (
          <Stack spacing={1.5}>
            {hiddenListings.map((listing) => {
              const isLoading = actionLoadingId === listing.id;

              return (
                <Card key={listing.id} variant="outlined">
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
                            {listing.title || "Hidden listing"}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Hidden {formatTimestamp(listing.hiddenAt)}
                          </Typography>
                        </Box>
                        <Chip
                          label="hidden"
                          color="warning"
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
                              {getReportReasonLabel(listing.hiddenReason)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Seller: {listing.userId || "Unknown"}
                            </Typography>
                          </Stack>
                          <Typography variant="body2" color="text.secondary">
                            This listing is currently hidden from public listing
                            surfaces.
                          </Typography>
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
                          onClick={() => navigate(`/listing/${listing.id}`)}
                          sx={{ alignSelf: { xs: "stretch", md: "flex-start" } }}
                        >
                          View Listing
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={isLoading}
                          onClick={() =>
                            setConfirmAction({
                              type: "restoreListing",
                              listing,
                            })
                          }
                        >
                          Restore Listing
                        </Button>
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

      <Snackbar
        open={Boolean(actionSnackbar)}
        autoHideDuration={3600}
        onClose={(_, reason) => {
          if (reason !== "clickaway") {
            setActionSnackbar(null);
          }
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {actionSnackbar && (
          <Alert
            onClose={() => setActionSnackbar(null)}
            severity={actionSnackbar.severity}
            variant="filled"
            sx={{ width: "100%" }}
          >
            {actionSnackbar.message}
          </Alert>
        )}
      </Snackbar>
    </Box>
  );
}
