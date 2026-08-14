import { Box, Button, CircularProgress, Typography } from "@mui/material";

export default function PageState({
  action,
  actionLabel,
  icon,
  message,
  onAction,
  title = "Loading",
  variant = "default",
}) {
  const isLoading = variant === "loading";
  const defaultIcon = (
    <Box sx={{ width: 24, display: "flex", flexDirection: "column", gap: 0.5 }}>
      <Box sx={{ height: 5, borderRadius: 1, bgcolor: "text.primary", ml: 0.75 }} />
      <Box sx={{ height: 5, borderRadius: 1, bgcolor: "primary.main", mr: 0.75 }} />
      <Box sx={{ height: 5, borderRadius: 1, bgcolor: "text.primary", ml: 0.75 }} />
    </Box>
  );

  return (
    <Box
      sx={{
        width: "100%",
        minHeight: { xs: "42vh", md: "48vh" },
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: { xs: 2, sm: 3 },
        py: { xs: 5, md: 8 },
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: 520,
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 3,
          boxShadow: "0 18px 44px rgba(31, 53, 99, 0.07)",
          px: { xs: 3, sm: 4 },
          py: { xs: 3.5, sm: 4.5 },
          textAlign: "center",
        }}
      >
        <Box
          sx={{
            width: 48,
            height: 48,
            mx: "auto",
            mb: 2,
            borderRadius: 2,
            display: "grid",
            placeItems: "center",
            bgcolor: "primary.50",
            color: "primary.main",
          }}
        >
          {isLoading ? <CircularProgress size={24} thickness={4.5} /> : icon || defaultIcon}
        </Box>
        <Typography variant="h5" component="h1" fontWeight={800}>
          {title}
        </Typography>
        {message && (
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ mt: 1, maxWidth: 420, mx: "auto" }}
          >
            {message}
          </Typography>
        )}
        {(action || actionLabel) && (
          <Button
            variant="contained"
            onClick={onAction}
            href={action}
            sx={{ mt: 3 }}
          >
            {actionLabel}
          </Button>
        )}
      </Box>
    </Box>
  );
}
