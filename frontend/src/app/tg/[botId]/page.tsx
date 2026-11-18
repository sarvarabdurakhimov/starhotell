import type { Metadata, Viewport } from "next";
import { MiniApp } from "@/components/telegram/MiniApp";

// Telegram Mini App of a hotel's booking bot: opened from the bot's menu / "open app" button.
export const metadata: Metadata = { title: "Bron qilish" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false };

export default async function TelegramMiniAppPage({ params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  return <MiniApp botId={botId} />;
}
