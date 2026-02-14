import { NextResponse } from "next/server";
import { getStrains } from "@/lib/dutchie-client";
import { cacheGet, cacheSet } from "@/lib/cache";
import { CACHE_TTL } from "@/lib/constants";
import type { StrainDetail } from "@/lib/types";

export async function GET() {
  try {
    const cached = cacheGet<StrainDetail[]>("strains");
    if (cached) {
      const res = NextResponse.json(cached);
      res.headers.set("Cache-Control", "private, max-age=3600");
      return res;
    }

    const strains = await getStrains();
    cacheSet("strains", strains, CACHE_TTL.strains);

    const res = NextResponse.json(strains);
    res.headers.set("Cache-Control", "private, max-age=3600");
    return res;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch strains";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
