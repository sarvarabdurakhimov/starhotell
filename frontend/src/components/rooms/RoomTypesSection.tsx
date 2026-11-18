"use client";

// Room types with their photos and description: what guests see in the Telegram bot.
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { IconPencil, IconPhotoPlus, IconTrash, IconUsers, IconX } from "@tabler/icons-react";
import { apiClient } from "@/lib/api/client";
import { apiError, money } from "@/lib/api/helpers";
import { usePanel } from "@/lib/panel-context";
import type { RoomType } from "@/types";

const MAX_PHOTOS = 8;

function RoomTypeCard({ rt, canManage }: { rt: RoomType; canManage: boolean }) {
  const { hotelId } = usePanel();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(rt.description || "");
  const [preview, setPreview] = useState<string | null>(null);
  const photos = rt.photos || [];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["room-types", hotelId] });

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const fd = new FormData();
      files.forEach((f) => fd.append("image", f));
      return apiClient.post(`/rooms/hotels/${hotelId}/room-types/${rt.id}/photos/`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (err) => setError(apiError(err)),
  });

  const remove = useMutation({
    mutationFn: (photoId: number) => apiClient.delete(`/rooms/hotels/${hotelId}/room-types/${rt.id}/photos/${photoId}/`),
    onSuccess: refresh,
    onError: (err) => setError(apiError(err)),
  });

  const save = useMutation({
    mutationFn: () => apiClient.patch(`/rooms/hotels/${hotelId}/room-types/${rt.id}/`, { description }),
    onSuccess: () => {
      setEditing(false);
      setError(null);
      refresh();
    },
    onError: (err) => setError(apiError(err)),
  });

  return (
    <div className="bg-white border border-stone-200 rounded p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-serif font-bold text-stone-900">{rt.name}</h3>
          <div className="text-[11px] text-stone-500 flex items-center gap-2">
            <span className="font-mono font-bold text-stone-800">{money(rt.base_price)}</span> / tun
            <span className="inline-flex items-center gap-0.5">
              <IconUsers className="w-3 h-3" /> {rt.max_occupancy}
            </span>
          </div>
        </div>
        {canManage && !editing && (
          <button
            onClick={() => {
              setDescription(rt.description || "");
              setEditing(true);
            }}
            title="Tavsifni tahrirlash"
            aria-label="Tavsifni tahrirlash"
            className="p-1.5 rounded hover:bg-stone-100 text-stone-600"
          >
            <IconPencil className="w-4 h-4" />
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={600}
            placeholder="Masalan: 32 m², katta karavot, shaharga qaragan balkon"
            className="w-full px-3 py-2 border border-stone-300 rounded focus:border-stone-900 outline-none text-xs"
          />
          <div className="flex justify-end gap-2 text-xs">
            <button onClick={() => setEditing(false)} className="px-3 py-1 text-stone-600 hover:bg-stone-100 rounded font-semibold">
              Bekor
            </button>
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="px-3 py-1 bg-stone-900 hover:bg-stone-800 text-white rounded font-semibold disabled:opacity-50"
            >
              Saqlash
            </button>
          </div>
        </div>
      ) : (
        <p className={`text-xs ${rt.description ? "text-stone-700" : "text-stone-400 italic"}`}>
          {rt.description || "Tavsif yo'q. Mijozlar botda shu matnni ko'radi."}
        </p>
      )}

      {error && <div className="p-2 rounded bg-rose-50 border border-rose-200 text-rose-800 text-[11px]">{error}</div>}

      <div className="grid grid-cols-4 gap-2">
        {photos.map((p) => (
          <div key={p.id} className="relative group aspect-square">
            <button onClick={() => setPreview(p.url)} className="w-full h-full" title="Kattalashtirish">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={rt.name} className="w-full h-full object-cover rounded border border-stone-200" />
            </button>
            {canManage && (
              <button
                onClick={() => {
                  if (confirm("Rasmni o'chirasizmi?")) remove.mutate(p.id);
                }}
                title="Rasmni o'chirish"
                aria-label="Rasmni o'chirish"
                className="absolute top-1 right-1 p-1 rounded bg-white/90 text-rose-700 opacity-0 group-hover:opacity-100 focus:opacity-100 transition shadow"
              >
                <IconTrash className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
        {canManage && photos.length < MAX_PHOTOS && (
          <button
            onClick={() => fileInput.current?.click()}
            disabled={upload.isPending}
            title="Rasm qo'shish"
            className="aspect-square flex flex-col items-center justify-center gap-1 rounded border-2 border-dashed border-stone-300 hover:border-stone-500 hover:bg-stone-50 text-stone-500 text-[10px] font-semibold disabled:opacity-50"
          >
            <IconPhotoPlus className="w-5 h-5" />
            {upload.isPending ? "Yuklanmoqda..." : "Rasm"}
          </button>
        )}
      </div>
      {photos.length === 0 && !canManage && <p className="text-[11px] text-stone-400">Rasm yo&apos;q</p>}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          // Copy first: clearing the input empties the live FileList
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          if (files.length) upload.mutate(files);
        }}
      />

      {preview && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt={rt.name} className="max-w-full max-h-full rounded shadow-2xl" />
          <button className="absolute top-4 right-4 text-white" title="Yopish" aria-label="Yopish">
            <IconX className="w-6 h-6" />
          </button>
        </div>
      )}
    </div>
  );
}

export function RoomTypesSection({ roomTypes, canManage }: { roomTypes: RoomType[]; canManage: boolean }) {
  if (roomTypes.length === 0) return null;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-serif font-bold text-stone-900">Xona turlari</h2>
        <p className="text-xs text-stone-500">
          Rasm va tavsiflar Telegram botda mijozlarga ko&apos;rsatiladi. Har bir turga {MAX_PHOTOS} tagacha rasm.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {roomTypes.map((rt) => (
          <RoomTypeCard key={rt.id} rt={rt} canManage={canManage} />
        ))}
      </div>
    </section>
  );
}
