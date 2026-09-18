import { useEffect, useState } from "react";
import { Alert, Autocomplete, Button, Stack, TextField, Typography } from "@mui/material";
import { Bookmark, Close } from "@mui/icons-material";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../contexts/useAuth";
import { fetchLocationSuggestionOptions, getLocationOptionLabel } from "../utils/locationSearch";

export default function SavedMeetupLocation({ location, onUse, editable = false }) {
  const { currentUser } = useAuth();
  const saved = currentUser?.savedMeetupLocation;
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!editable || query.trim().length < 2 || query === selected?.label) {
      setOptions([]);
      setLoading(false);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await fetchLocationSuggestionOptions(query);
        if (active) setOptions(results);
      } catch {
        if (active) setNotice("Couldn't load locations. Please try again.");
      } finally {
        if (active) setLoading(false);
      }
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [editable, query, selected]);

  async function save(value) {
    if (busy || !currentUser?.uid) return;
    setBusy(true);
    setNotice("");
    try {
      await updateDoc(doc(db, "users", currentUser.uid), { savedMeetupLocation: value });
      setSelected(null);
      setQuery("");
    } catch {
      setNotice("Couldn't update your saved location. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const candidate = editable ? selected : location;
  return (
    <Stack spacing={1} sx={{ my: 1 }}>
      {editable && <Typography variant="subtitle2">Saved meetup location</Typography>}
      {saved && <Typography variant="body2" color="text.secondary">Saved: {saved.label}</Typography>}
      {editable && (
        <Autocomplete
          value={selected} inputValue={query} options={options} loading={loading} disabled={busy}
          filterOptions={(values) => values} getOptionLabel={getLocationOptionLabel}
          isOptionEqualToValue={(a, b) => a.label === b.label}
          onChange={(_, value) => { setSelected(value); setQuery(value?.label || ""); setNotice(""); }}
          onInputChange={(_, value, reason) => { if (reason === "input" || reason === "clear") { setQuery(value); setSelected(null); } }}
          renderInput={(params) => <TextField {...params} label="City or area" size="small" />}
        />
      )}
      <Stack direction="row" gap={1} flexWrap="wrap">
        {saved && onUse && <Button size="small" disabled={busy} startIcon={<Bookmark />} onClick={() => onUse(saved)}>Use saved location</Button>}
        {candidate && candidate.label !== saved?.label && <Button size="small" disabled={busy} startIcon={<Bookmark />} onClick={() => save(candidate)}>{busy ? "Saving..." : saved ? "Update saved location" : "Save as my meetup location"}</Button>}
        {saved && <Button size="small" disabled={busy} startIcon={<Close />} onClick={() => save(null)}>Clear saved location</Button>}
      </Stack>
      {notice && <Alert severity="error">{notice}</Alert>}
    </Stack>
  );
}
