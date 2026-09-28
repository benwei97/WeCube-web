import { Alert, Box, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { Send } from "@mui/icons-material";
import { useAuth } from "../contexts/useAuth";
import { FEEDBACK_CATEGORIES, useFeedbackForm } from "../hooks/useFeedback";

export default function Feedback() {
  const { currentUser } = useAuth();
  const form = useFeedbackForm(currentUser, "web");
  return (
    <Box sx={{ width: "100%", maxWidth: 680, p: { xs: 2, sm: 4 } }}>
      <Typography variant="h4" component="h1" gutterBottom>Feedback</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>Found a bug or have an idea? I'd love to hear it. - Ben</Typography>
      {!currentUser ? <Alert severity="info">Sign in using the account button to send feedback.</Alert> : form.sent ? (
        <Stack spacing={2}>
          <Alert severity="success">Thanks! Your feedback is in my inbox.</Alert>
          <Button onClick={() => form.setSent(false)}>Send more feedback</Button>
        </Stack>
      ) : (
        <Stack component="form" spacing={2} onSubmit={(event) => { event.preventDefault(); form.submit(); }}>
          {form.error && <Alert severity="error">{form.error}</Alert>}
          <TextField select label="What would you like to share?" value={form.category} onChange={(event) => form.setCategory(event.target.value)} disabled={form.busy}>
            {Object.entries(FEEDBACK_CATEGORIES).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
          </TextField>
          <TextField required label="Subject" value={form.subject} onChange={(event) => form.setSubject(event.target.value)} slotProps={{ htmlInput: { maxLength: 120 } }} disabled={form.busy} />
          <TextField required multiline minRows={6} label={form.category === "bug" ? "What happened?" : "Your feedback"} placeholder={form.category === "bug" ? "What were you doing, and what went wrong?" : "What's on your mind?"} value={form.details} onChange={(event) => form.setDetails(event.target.value)} slotProps={{ htmlInput: { maxLength: 4000 } }} helperText={`${form.details.length}/4000 · Only WeCube admins can read this.`} disabled={form.busy} />
          <Button type="submit" variant="contained" startIcon={<Send />} disabled={!form.canSubmit}>{form.busy ? "Sending..." : "Send feedback"}</Button>
        </Stack>
      )}
    </Box>
  );
}
