import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import AppShell from "./layout/AppShell";
import AnalyticsPage from "./pages/AnalyticsPage";
import CriminalDetailPage from "./pages/CriminalDetailPage";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import ProfilesPage from "./pages/ProfilesPage";
import RelationshipsPage from "./pages/RelationshipsPage";
import SearchPage from "./pages/SearchPage";
import SettingsPage from "./pages/SettingsPage";
import "./styles.css";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/entities" element={<Navigate to="/profiles?kind=user" state={{ openDirectory: true }} replace />} />
        <Route path="/profiles" element={<ProfilesPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/relationships" element={<RelationshipsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/criminal/:id" element={<CriminalDetailPage />} />
        <Route path="/entity/:id" element={<CriminalDetailPage />} />
        <Route path="/profile/:id" element={<CriminalDetailPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
