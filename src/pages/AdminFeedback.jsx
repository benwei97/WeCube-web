import { useState } from "react";
import { Alert, Box, Button, ButtonBase, Chip, Collapse, MenuItem, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import { BugReportOutlined, ChatBubbleOutline, ExpandMore, InboxOutlined } from "@mui/icons-material";
import { useAuth } from "../contexts/useAuth";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, feedbackDate, useFeedbackInbox } from "../hooks/useFeedback";

export default function AdminFeedback() {
  const { currentUser } = useAuth();
  const inbox = useFeedbackInbox(currentUser?.isAdmin, currentUser?.uid);
  const [expandedId, setExpandedId] = useState(null);
  if (!currentUser?.isAdmin) return <Alert severity="info" sx={{ m: 3, alignSelf: "flex-start" }}>Admin access required.</Alert>;
  return (
    <Box sx={{ width: "100%", maxWidth: 1040, minWidth: 0, p: { xs: 2, sm: 4 }, overflowWrap: "anywhere" }}>
      <Typography variant="h4" component="h1" sx={{ mb: 3 }}>Feedback inbox</Typography>
      <Tabs value={inbox.filter} onChange={(_, value) => { inbox.setFilter(value); setExpandedId(null); }} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile aria-label="Feedback status" sx={{ borderBottom: 1, borderColor: "divider", mb: 1, "& .MuiTab-root": { minWidth: 0, px: 2 } }}>
        {Object.entries({ all: "All", ...FEEDBACK_STATUSES }).map(([value, label]) => <Tab key={value} value={value} label={label} />)}
      </Tabs>
      {inbox.error && <Alert severity="error" action={<Button onClick={inbox.retry}>Retry</Button>}>{inbox.error}</Alert>}
      {inbox.loading && <Typography role="status">Loading feedback...</Typography>}
      {!inbox.loading && !inbox.error && !inbox.items.length && <Stack alignItems="center" spacing={1} sx={{ py: 8, color: "text.secondary" }}><InboxOutlined sx={{ fontSize: 32 }} /><Typography>No feedback in this view yet.</Typography></Stack>}
      <Box>
        {inbox.items.map((item) => {
          const expanded = expandedId === item.id;
          return <Box key={item.id} component="article" sx={{ borderBottom: 1, borderColor: "divider" }}>
            <ButtonBase onClick={() => setExpandedId(expanded ? null : item.id)} aria-expanded={expanded} aria-controls={`feedback-${item.id}`} sx={{ width: "100%", p: 2, textAlign: "left", display: "flex", gap: 2, alignItems: "flex-start", borderRadius: 1, bgcolor: expanded ? "action.hover" : "transparent", "&:hover": { bgcolor: "action.hover" }, "&.Mui-focusVisible": { outline: "2px solid", outlineColor: "primary.main" } }}>
              <Box sx={{ color: "text.secondary", pt: 0.25, display: { xs: "none", sm: "block" } }}>{item.category === "bug" ? <BugReportOutlined /> : <ChatBubbleOutline />}</Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" alignItems="center" useFlexGap flexWrap="wrap" gap={1} sx={{ mb: 0.5 }}>
                  <Typography component="span" sx={{ fontWeight: 700 }}>{item.subject}</Typography>
                  <Chip size="small" variant="outlined" color={item.status === "resolved" ? "success" : item.status === "in_progress" ? "warning" : "primary"} label={FEEDBACK_STATUSES[item.status]} sx={{ height: 24 }} />
                </Stack>
                {!expanded && <Typography component="span" color="text.secondary" sx={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14, mb: 1 }}>{item.details}</Typography>}
                <Typography component="span" variant="caption" color="text.secondary">{item.name} · {feedbackDate(item.createdAt)} · {item.platform === "ios" ? "iOS" : item.platform === "android" ? "Android" : "Web"}</Typography>
              </Box>
              <ExpandMore sx={{ color: "text.secondary", transform: expanded ? "rotate(180deg)" : "none", flexShrink: 0 }} />
            </ButtonBase>
            <Collapse in={expanded} unmountOnExit>
              <Box id={`feedback-${item.id}`} sx={{ px: { xs: 2, sm: 7 }, pt: 2, pb: 3 }}>
                <Typography variant="caption" color="text.secondary">{FEEDBACK_CATEGORIES[item.category]}</Typography>
                <Typography sx={{ whiteSpace: "pre-wrap", mt: 1, mb: 3, maxWidth: "75ch" }}>{item.details}</Typography>
                <Stack direction={{ xs: "column", sm: "row" }} gap={2} justifyContent="space-between" alignItems={{ xs: "stretch", sm: "center" }}>
                  <Box><Typography variant="caption" color="text.secondary" display="block">Account: {item.userId}</Typography>{item.version && <Typography variant="caption" color="text.secondary" display="block">Version: {item.version}</Typography>}</Box>
                  <TextField select size="small" label="Submission status" value={item.status} disabled={Boolean(inbox.saving)} onChange={(event) => inbox.updateStatus(item.id, event.target.value)} sx={{ minWidth: 180, flexShrink: 0 }}>
              {Object.entries(FEEDBACK_STATUSES).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
                  </TextField>
                </Stack>
              </Box>
            </Collapse>
          </Box>;
        })}
      </Box>
      {inbox.hasMore && <Button onClick={inbox.loadMore} disabled={inbox.loading}>Load older feedback</Button>}
    </Box>
  );
}
