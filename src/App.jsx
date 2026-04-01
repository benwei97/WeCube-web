import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import { Box } from "@mui/material";
import "./App.css";
import theme from "./theme";
import { AuthProvider } from "./contexts/AuthContext";
import Header from "./components/Header";
import Dashboard from "./pages/Dashboard";
import Browse from "./pages/Browse";
import Competitions from "./pages/Competitions";
import Sell from "./pages/Sell";
import ListingDetail from "./pages/ListingDetail";
import Messages from "./pages/Messages";

function App() {
  return (
    <ThemeProvider theme={theme}>
      <AuthProvider>
        <Router>
          <Header />
          <Box
            component="main"
            sx={{
              pt: 8,
              display: "flex",
              justifyContent: "center",
              width: "100vw",
            }}
          >
            <Routes>
              <Route path="/" element={<Browse />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/competitions" element={<Competitions />} />
              <Route path="/sell" element={<Sell />} />
              <Route path="/listing/:id" element={<ListingDetail />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/messages/:conversationId" element={<Messages />} />
              <Route
                path="/my-listings"
                element={
                  <div>
                    <h1>My Listings</h1>
                    <p>Coming soon...</p>
                  </div>
                }
              />
              <Route
                path="/my-purchases"
                element={
                  <div>
                    <h1>My Purchases</h1>
                    <p>Coming soon...</p>
                  </div>
                }
              />
              <Route
                path="/settings"
                element={
                  <div>
                    <h1>Settings</h1>
                    <p>Coming soon...</p>
                  </div>
                }
              />
            </Routes>
          </Box>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
