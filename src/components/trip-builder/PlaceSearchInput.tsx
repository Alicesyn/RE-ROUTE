import React, { useState, useRef, useEffect } from "react";
import {
  MapPin,
  Loader2,
  Plane,
  Train,
  MapPinIcon,
  X,
} from "lucide-react";
import { useRouteStore } from "../../store/useRouteStore";
import { searchPlaces } from "../../services/mapsService";
import { motion, AnimatePresence } from "framer-motion";

interface PlaceSearchInputProps {
  onSelect: (place: any) => void;
  placeholder?: string;
  currentValue?: string;
  icon?: "airport" | "station" | "pin";
}

export const PlaceSearchInput: React.FC<PlaceSearchInputProps> = ({
  onSelect,
  placeholder = "Search for a place...",
  currentValue,
  icon = "pin",
}) => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { appMode } = useRouteStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let isCancelled = false;

    // Only search when the user is actively typing, not after a selection
    if (!isEditing) {
      setIsLoading(false);
      return;
    }

    if (appMode !== "real") {
      setIsLoading(false);
      // Simple mock for airports/stations
      const mockPlaces = [
        {
          id: "m1",
          name: "John F. Kennedy International Airport",
          address: "Queens, NY 11430",
          category: "transport",
          lat: 40.6413,
          lng: -73.7781,
        },
        {
          id: "m2",
          name: "Penn Station",
          address: "234 W 31st St, New York, NY",
          category: "transport",
          lat: 40.7505,
          lng: -73.9934,
        },
      ];
      if (query.length > 0) {
        setResults(
          mockPlaces.filter((p) =>
            p.name.toLowerCase().includes(query.toLowerCase()),
          ),
        );
        setIsOpen(true);
      } else {
        setResults([]);
        setIsOpen(false);
      }
      return;
    }

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (query.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const mapsResults = await searchPlaces(query);
        if (isCancelled) return;
        setResults(mapsResults);
        setIsOpen(true);
      } catch (error) {
        if (isCancelled) return;
        console.error("Place search failed:", error);
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }, 500);

    return () => {
      isCancelled = true;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [query, appMode, isEditing]);

  const IconComponent = () => {
    if (icon === "airport")
      return <Plane className="w-4 h-4 text-surface-400" />;
    if (icon === "station")
      return <Train className="w-4 h-4 text-surface-400" />;
    return <MapPinIcon className="w-4 h-4 text-surface-400" />;
  };

  return (
    <div className="relative">
      <div className="relative group">
        <div className="absolute left-3 top-1/2 -translate-y-1/2">
          {isLoading ? (
            <Loader2 className="w-4 h-4 text-primary-500 animate-spin" />
          ) : (
            <IconComponent />
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={isEditing ? query : currentValue || query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsEditing(true);
          }}
          onFocus={() => {
            setIsOpen(results.length > 0);
            setIsEditing(true);
          }}
          placeholder={placeholder}
          className="w-full bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl py-2.5 pl-10 pr-10 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-surface-900 dark:text-white"
        />
        {(query || currentValue) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setQuery("");
              onSelect(null);
              setIsEditing(false);
              setIsOpen(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute z-50 left-0 right-0 mt-2 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto custom-scrollbar"
          >
            {results.map((place) => (
              <button
                key={place.id}
                onClick={() => {
                  onSelect(place);
                  setQuery(place.name);
                  setIsOpen(false);
                  setIsEditing(false);
                  setResults([]);
                  inputRef.current?.blur();
                }}
                className="w-full flex items-start gap-3 p-3 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors text-left border-b border-surface-50 dark:border-surface-700 last:border-none"
              >
                <div className="w-8 h-8 rounded-full bg-surface-100 dark:bg-surface-900 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4 text-surface-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-surface-900 dark:text-white truncate">
                    {place.name}
                  </p>
                  <p className="text-xs text-surface-500 truncate">
                    {place.address}
                  </p>
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
