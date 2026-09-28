import { Alert, Box, Button, Chip, Divider, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useAuth } from "../contexts/useAuth";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, feedbackDate, useFeedbackInbox } from "../hooks/useFeedback";

export default function AdminFeedback() {
  const { currentUser } = useAuth();
  const inbox = useFeedbackInbox(currentUser?.isAdmin, currentUser?.uid);
  if (!currentUser?.isAdmin) return <Alert severity="info" sx={{ m: 3, alignSelf: "flex-start" }}>Admin access required.</Alert>;
  return (
    <Box sx={{ width: "100%", maxWidth: 1000, p: { xs: 2, sm: 4 }, overflowWrap: "anywhere" }}>
      <Typography variant="h4" component="h1" gutterBottom>Feedback inbox</Typography>
      <TextField select label="Status" value={inbox.filter} onChange={(event) => inbox.setFilter(event.target.value)} size="small" sx={{ my: 2, minWidth: 180 }}>
        <MenuItem value="all">All statuses</MenuItem>
        {Object.entries(FEEDBACK_STATUSES).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
      </TextField>
      {inbox.error && <Alert severity="error" action={<Button onClick={inbox.retry}>Retry</Button>}>{inbox.error}</Alert>}
      {inbox.loading && <Typography role="status">Loading feedback...</Typography>}
      {!inbox.loading && !inbox.error && !inbox.items.length && <Typography color="text.secondary">No feedback in this view yet.</Typography>}
      <Stack divider={<Divider />}>
        {inbox.items.map((item) => (
          <Box key={item.id} component="article" sx={{ py: 3 }}>
            <Stack direction="row" spacing={1} sx={{ mb: 1 }}><Chip size="small" label={FEEDBACK_CATEGORIES[item.category]} /><Chip size="small" label={item.platform} /></Stack>
            <Typography variant="h6" component="h2">{item.subject}</Typography>
            <Typography variant="body2" color="text.secondary">{item.name} · {feedbackDate(item.createdAt)}{item.version ? ` · ${item.version}` : ""}</Typography>
            <Typography variant="caption" color="text.secondary">Account: {item.userId}</Typography>
            <Typography sx={{ whiteSpace: "pre-wrap", my: 2 }}>{item.details}</Typography>
            <TextField select size="small" label="Submission status" value={item.status} disabled={Boolean(inbox.saving)} onChange={(event) => inbox.updateStatus(item.id, event.target.value)} sx={{ minWidth: 180 }}>
              {Object.entries(FEEDBACK_STATUSES).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
            </TextField>
          </Box>
        ))}
      </Stack>
      {inbox.hasMore && <Button onClick={inbox.loadMore} disabled={inbox.loading}>Load older feedback</Button>}
    </Box>
  );
}
