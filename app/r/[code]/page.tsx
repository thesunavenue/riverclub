import type { Metadata } from "next";
import { RoomScreen } from "../../_components/room-screen";

export const metadata: Metadata = { title: "RiverCrew table", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <RoomScreen code={code.toUpperCase()} />;
}
