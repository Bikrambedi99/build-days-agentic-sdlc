import {
  InMemoryProductCatalogue,
  ProductNotFoundError,
  products,
} from "../src/server/catalogue.js";

describe("product catalogue", () => {
  it("provides stable deterministic products", async () => {
    const catalogue = new InMemoryProductCatalogue();

    expect(await catalogue.list()).toEqual(products);
    expect(products.map((product) => product.id)).toEqual([
      "aurora-desk-lamp",
      "cloudrest-throw",
      "trailmark-bottle",
      "tideline-picnic-blanket",
      "nesting-prep-bowls",
      "emberline-kettle",
      "papertrail-notebook-set",
      "harbor-catchall-tray",
    ]);
  });

  it("filters by category and case-insensitive search", async () => {
    const catalogue = new InMemoryProductCatalogue();

    await expect(catalogue.list({ q: "LAMP", category: "office" })).resolves.toEqual([
      expect.objectContaining({ id: "aurora-desk-lamp" }),
    ]);
    await expect(catalogue.list({ q: "", category: "kitchen" })).resolves.toHaveLength(2);
  });

  it("sorts by integer price while preserving ties and the source order", async () => {
    const items = [
      { ...products[0]!, priceCents: 500 },
      { ...products[1]!, priceCents: 300 },
      { ...products[2]!, priceCents: 500 },
    ];
    const catalogue = new InMemoryProductCatalogue(items);

    await expect(catalogue.list({ q: "", sort: "price-asc" })).resolves.toEqual([
      items[1],
      items[0],
      items[2],
    ]);
    await expect(catalogue.list({ q: "", sort: "price-desc" })).resolves.toEqual([
      items[0],
      items[2],
      items[1],
    ]);
    expect(items).toEqual([
      { ...products[0]!, priceCents: 500 },
      { ...products[1]!, priceCents: 300 },
      { ...products[2]!, priceCents: 500 },
    ]);
  });

  it("returns product details and rejects missing products", async () => {
    const catalogue = new InMemoryProductCatalogue();

    await expect(catalogue.getById("trailmark-bottle")).resolves.toMatchObject({
      name: "Trailmark Bottle",
      priceCents: 3199,
    });
    await expect(catalogue.getById("missing")).rejects.toBeInstanceOf(
      ProductNotFoundError,
    );
  });
});
