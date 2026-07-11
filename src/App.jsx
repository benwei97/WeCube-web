import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import { Box } from "@mui/material";
import "./App.css";
import theme from "./theme";
import { AuthProvider } from "./contexts/AuthContext";
import Header from "./components/Header";
import Dashboard from "./pages/Dashboard";
import Browse from "./pages/Browse";
import Competitions from "./pages/Competitions";
import CompetitionListings from "./pages/CompetitionListings";
import Sell from "./pages/Sell";
import ListingDetail from "./pages/ListingDetail";
import Messages from "./pages/Messages";
import SellerProfile from "./pages/SellerProfile";

function App() {
  return (
    <ThemeProvider theme={theme}>
      <AuthProvider>
        <Router>
          <Header />
          <Box
            component="main"
            sx={{
              pt: { xs: 11, md: 8 },
              display: "flex",
              justifyContent: "center",
              width: "100vw",
              minHeight: "100vh",
              bgcolor: "#ffffff",
            }}
          >
            <Routes>
              <Route path="/" element={<Browse />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/competitions" element={<Competitions />} />
              <Route
                path="/competitions/:competitionId/listings"
                element={<CompetitionListings />}
              />
              <Route path="/sell" element={<Sell />} />
              <Route path="/listing/:id" element={<ListingDetail />} />
              <Route path="/seller/:userId" element={<SellerProfile />} />
              <Route path="/user/:userId" element={<SellerProfile />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/messages/:conversationId" element={<Messages />} />
              <Route path="/my-listings" element={<Navigate to="/dashboard" replace />} />
              <Route path="/my-purchases" element={<Navigate to="/dashboard" replace />} />
              <Route path="/my-reviews" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Box>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
