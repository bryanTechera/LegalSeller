import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({
  signIn: vi.fn(),
}));
vi.mock("next-auth/react", () => authMock);

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

import { LoginForm } from "./LoginForm";

function renderYEnviar(email: string) {
  render(<LoginForm errorInicial={null} />);
  fireEvent.change(screen.getByLabelText("Tu email"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Enviarme el enlace" }));
}

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("email fuera de la allowlist: signIn resuelve con error, muestra el aviso y no navega", async () => {
    authMock.signIn.mockResolvedValue({
      error: "AccessDenied",
      code: "AccessDenied",
      status: 200,
      ok: true,
      url: null,
    });

    renderYEnviar("intruso@example.com");

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos iniciar sesión con ese email.");
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("email autorizado: signIn resuelve sin error, navega a check-email", async () => {
    authMock.signIn.mockResolvedValue({ error: undefined, code: undefined, status: 200, ok: true, url: "/board" });

    renderYEnviar("ana@jurco.uy");

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith("/login/check-email"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
