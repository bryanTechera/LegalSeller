import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RegistroVisita } from "./RegistroVisita";

describe("RegistroVisita", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  it("manda los UTM del link al montar, y solo los que vienen", () => {
    window.history.replaceState(null, "", "/?utm_source=instagram&utm_campaign=lanzamiento&fbclid=abc");

    render(<RegistroVisita />);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/visita");
    expect(init).toMatchObject({ method: "POST", keepalive: true });
    expect(JSON.parse(init.body as string)).toEqual({ utmSource: "instagram", utmCampaign: "lanzamiento" });
  });

  it("un beacon que falla no rompe la página", () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(() => render(<RegistroVisita />)).not.toThrow();
  });
});
