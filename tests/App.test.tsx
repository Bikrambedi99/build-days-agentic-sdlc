// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/client/App.js";
import type { Product, ProductListResponse } from "../src/shared/contracts.js";

const product: Product = {
  id: "trail-lamp",
  name: "Glowpath Lantern",
  shortDescription: "A friendly light for late-night wandering.",
  description: "A rechargeable lantern designed for tabletops and trails.",
  category: "outdoors",
  priceCents: 2499,
  rating: 4.7,
  reviewCount: 83,
  availability: "in-stock",
  badge: "Trail favorite",
  features: ["Three brightness levels", "USB-C charging"],
  accent: "#527a62",
};

const lowerPriceProduct: Product = {
  ...product,
  id: "pocket-notebook",
  name: "Pocket Notebook",
  priceCents: 899,
};

const listResponse = (items: Product[]): ProductListResponse => ({
  items,
  total: items.length,
  query: { q: "" },
  categories: ["home", "outdoors", "office", "kitchen"],
});

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("KosKo client", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("loads products and supports filters and an empty result", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      return jsonResponse(
        url.includes("q=missing") ? listResponse([]) : listResponse([product]),
      );
    });
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("link", { name: "KosKo home" })).toHaveAttribute("href", "#catalogue");
    expect(screen.getByRole("status")).toHaveTextContent("Loading products");
    expect(await screen.findByRole("heading", { name: product.name })).toBeVisible();

    await user.selectOptions(screen.getByLabelText("Category"), "outdoors");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/products?category=outdoors",
        expect.anything(),
      ),
    );

    await user.type(screen.getByLabelText("Search products"), "missing");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("heading", { name: "No products found" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByRole("heading", { name: product.name })).toBeVisible();
  });

  it("offers retry when the catalogue fails", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("Catalogue connection failed."))
      .mockResolvedValueOnce(jsonResponse(listResponse([])));
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Catalogue connection failed.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "No products found" })).toBeVisible();
  });

  it("sorts catalogue results while preserving filters and clears all filters", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input), "http://localhost");
      if (url.searchParams.get("q") === "missing") return jsonResponse(listResponse([]));

      const items =
        url.searchParams.get("sort") === "price-asc"
          ? [lowerPriceProduct, product]
          : url.searchParams.get("sort") === "price-desc"
            ? [product, lowerPriceProduct]
            : [product, lowerPriceProduct];
      return jsonResponse(listResponse(items));
    });
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText("2 products, in catalogue order.")).toBeVisible();
    const sortSelect = screen.getByLabelText("Sort by price");
    await user.selectOptions(sortSelect, "price-desc");
    expect(await screen.findByText("2 products, sorted by price high to low.")).toBeVisible();
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent))
      .toEqual([product.name, lowerPriceProduct.name]);

    await user.selectOptions(sortSelect, "price-asc");
    expect(await screen.findByText("2 products, sorted by price low to high.")).toBeVisible();
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent))
      .toEqual([lowerPriceProduct.name, product.name]);
    const lowerPriceCard = screen.getByRole("heading", { name: lowerPriceProduct.name }).closest("li")!;
    await user.click(within(lowerPriceCard).getByRole("button", { name: "Add to cart" }));
    const cart = screen.getByRole("heading", { name: "Cart" }).closest("aside")!;
    expect(within(cart).getByText(lowerPriceProduct.name)).toBeVisible();

    await user.selectOptions(screen.getByLabelText("Category"), "outdoors");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/products?category=outdoors&sort=price-asc",
        expect.anything(),
      ),
    );
    await user.type(screen.getByLabelText("Search products"), "lamp");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/products?q=lamp&category=outdoors&sort=price-asc",
        expect.anything(),
      ),
    );

    await user.clear(screen.getByLabelText("Search products"));
    await user.type(screen.getByLabelText("Search products"), "missing");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("heading", { name: "No products found" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(await screen.findByText("2 products, in catalogue order.")).toBeVisible();
    expect(screen.getByLabelText("Search products")).toHaveValue("");
    expect(screen.getByLabelText("Category")).toHaveValue("");
    expect(sortSelect).toHaveValue("");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith("/api/products", expect.anything()),
    );
  });

  it("loads details and manages cart quantities and totals", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      return url === `/api/products/${product.id}`
        ? jsonResponse({ product })
        : jsonResponse(listResponse([product]));
    });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: product.name });

    await user.click(screen.getByRole("button", { name: "View details" }));
    expect(await screen.findByText(product.description)).toBeVisible();
    expect(screen.getByText("Three brightness levels")).toBeVisible();

    await user.click(screen.getAllByRole("button", { name: "Add to cart" })[0]!);
    const cart = screen.getByRole("heading", { name: "Cart" }).closest("aside")!;
    expect(within(cart).getByText("$24.99 each")).toBeVisible();
    expect(within(cart).getByText("$24.99", { selector: ".subtotal strong" })).toBeVisible();

    await user.clear(screen.getByLabelText(`Quantity for ${product.name}`));
    await user.type(screen.getByLabelText(`Quantity for ${product.name}`), "2");
    expect(within(cart).getByText("$49.98", { selector: ".subtotal strong" })).toBeVisible();

    await user.click(within(cart).getByRole("button", { name: "Remove" }));
    expect(within(cart).getByText("Your cart is empty.")).toBeVisible();
  });

  it("validates checkout, confirms the order, and resets the cart", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(listResponse([product])));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: product.name });
    await user.click(screen.getByRole("button", { name: "Add to cart" }));
    await user.click(screen.getByRole("button", { name: "Place simulated order" }));

    expect(await screen.findByText("Enter your name.")).toBeVisible();
    expect(screen.getByLabelText("Full name")).toHaveAttribute("aria-invalid", "true");

    await user.type(screen.getByLabelText("Full name"), "Mira Chen");
    await user.type(screen.getByLabelText("Email"), "mira@example.com");
    await user.type(screen.getByLabelText("Delivery address"), "12 Comet Lane");
    await user.click(screen.getByRole("button", { name: "Place simulated order" }));

    expect(await screen.findByRole("heading", { name: "Order confirmed" })).toBeVisible();
    expect(screen.getByText("Your cart is empty.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Cart 0" })).toBeVisible();
  });
});
