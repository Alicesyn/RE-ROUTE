import React, { useState, useRef, useEffect } from "react";
import { Search, MapPin, Loader2 } from "lucide-react";
import { MOCK_HOTELS } from "../../services/mockData";
import { useRouteStore } from "../../store/useRouteStore";
import { searchPlaces } from "../../services/mapsService";
import { motion, AnimatePresence } from "framer-motion";

interface HotelSearchInputProps {
  onSelect: (hotel: any) => void;
  placeholder?: string;
  currentValue?: string;
}

export const HotelSearchInput: React.FC<HotelSearchInputProps> = ({
  onSelect,
  placeholder = "Search for a hotel...",
  currentValue,
}) => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const { appMode } = useRouteStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let isCancelled = false;

    if (appMode !== "real") {
      setIsLoading(false);
      if (query.length > 0) {
        setResults(
          MOCK_HOTELS.filter((h) =>
            h.name.toLowerCase().includes(query.toLowerCase()),
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
        // Specifically search for hotels/lodging
        const mapsResults = await searchPlaces(`${query} hotel`);
        if (isCancelled) return;
        setResults(mapsResults);
        setIsOpen(true);
        updateDropdownPosition();
      } catch (err) {
        if (isCancelled) return;
        console.error("Hotel search error:", err);
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
  }, [query, appMode]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const handleSelect = (hotel: any) => {
    setQuery("");
    setIsOpen(false);
    setIsEditing(false);
    onSelect(hotel);
  };

  const updateDropdownPosition = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      });
    }
  };

  const handleFocus = () => {
    setIsEditing(true);
    if (!query && currentValue) {
      setQuery(currentValue);
    }
    if (query) setIsOpen(true);
    updateDropdownPosition();
  };

  const handleBlur = () => {
    setTimeout(() => {
      setIsEditing(false);
      setIsOpen(false);
      setQuery("");
    }, 200);
  };

  useEffect(() => {
    if (!isOpen) return;
    updateDropdownPosition();
    const scrollContainer = inputRef.current?.closest(".overflow-y-auto");
    const handleReposition = () => updateDropdownPosition();
    scrollContainer?.addEventListener("scroll", handleReposition);
    window.addEventListener("resize", handleReposition);
    return () => {
      scrollContainer?.removeEventListener("scroll", handleReposition);
      window.removeEventListener("resize", handleReposition);
    };
  }, [isOpen]);

  const displayValue = isEditing ? query : currentValue || "";

  return (
    <div className="relative w-full">
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {isLoading ? (
            <Loader2 className="w-4 h-4 text-primary-500 animate-spin" />
          ) : (
            <Search className="text-surface-400 dark:text-surface-500 w-4 h-4" />
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={handleSearch}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="w-full bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-lg py-2 pl-9 pr-4 text-sm text-surface-900 dark:text-white placeholder:text-surface-400 dark:placeholder:text-surface-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all shadow-sm"
        />
      </div>

      <AnimatePresence>
        {isOpen && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            style={dropdownStyle}
            className="bg-white dark:bg-surface-800 rounded-lg shadow-lg border border-surface-100 dark:border-surface-700 overflow-hidden max-h-60 overflow-y-auto custom-scrollbar"
          >
            {results.map((hotel, i) => (
              <button
                key={hotel.id || i}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(hotel)}
                className="w-full text-left px-3 py-2 hover:bg-surface-50 dark:hover:bg-surface-700 flex flex-col group transition-colors border-b border-surface-50 dark:border-surface-700 last:border-0"
              >
                <span className="font-medium text-surface-900 dark:text-white text-sm">
                  {hotel.name}
                </span>
                <span className="text-[11px] text-surface-500 dark:text-surface-400 truncate flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {hotel.address}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
