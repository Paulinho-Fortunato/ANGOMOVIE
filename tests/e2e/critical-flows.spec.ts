import { expect, test } from "@playwright/test";

function respostaPadraoTMDB(url: string) {
  if (url.includes("/trending/all/day")) {
    return {
      results: [{ id: 101, title: "Destaque", overview: "Resumo", backdrop_path: "/hero.jpg", poster_path: "/hero-p.jpg" }]
    };
  }

  if (url.includes("/movie/popular") || url.includes("/movie/now_playing") || url.includes("/movie/top_rated")) {
    return {
      results: [
        { id: 201, title: "Filme Um", overview: "Desc", poster_path: "/f1.jpg", backdrop_path: "/b1.jpg", vote_average: 7.1 },
        { id: 202, title: "Filme Dois", overview: "Desc", poster_path: "/f2.jpg", backdrop_path: "/b2.jpg", vote_average: 7.4 }
      ],
      total_pages: 1
    };
  }

  if (url.includes("/tv/popular") || url.includes("/tv/top_rated") || url.includes("/discover/tv")) {
    return {
      results: [{ id: 301, name: "Serie Um", overview: "Desc", poster_path: "/s1.jpg", backdrop_path: "/sb1.jpg", vote_average: 8.1 }],
      total_pages: 1
    };
  }

  if (url.match(/\/tv\/\d+\/season\/\d+/)) {
    return {
      season_number: 1,
      episodes: [
        { id: 1, episode_number: 1, name: "Ep1", runtime: 45 },
        { id: 2, episode_number: 2, name: "Ep2", runtime: 45 }
      ]
    };
  }

  if (url.match(/\/movie\/\d+/)) {
    return {
      id: 201,
      title: "Filme Um",
      overview: "Descrição completa",
      poster_path: "/f1.jpg",
      backdrop_path: "/b1.jpg",
      vote_average: 7.1,
      vote_count: 1200,
      runtime: 120,
      genres: [{ id: 1, name: "Acção" }]
    };
  }

  if (url.match(/\/tv\/\d+/)) {
    return {
      id: 301,
      name: "Serie Um",
      overview: "Descrição completa",
      poster_path: "/s1.jpg",
      backdrop_path: "/sb1.jpg",
      vote_average: 8.1,
      vote_count: 800,
      number_of_seasons: 1,
      number_of_episodes: 2,
      episode_run_time: [45],
      genres: [{ id: 2, name: "Drama" }]
    };
  }

  return { results: [], total_pages: 1 };
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api.themoviedb.org/**", async (route) => {
    const url = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(respostaPadraoTMDB(url))
    });
  });
});

test("abre detalhes, reproduz e fecha modal", async ({ page }) => {
  await page.goto("/");
  await page.locator("#filmes article button").first().click();
  await expect(page.getByRole("heading", { name: "Detalhes" })).toBeVisible();
  await page.getByRole("button", { name: "Ver agora" }).click();
  await expect(page.getByRole("heading", { name: /A ver:/ })).toBeVisible();
});

test("download a partir dos detalhes abre modal de download", async ({ page }) => {
  await page.goto("/");
  await page.locator("#filmes article button").first().click();
  await page.getByRole("button", { name: "Download" }).click();
  await expect(page.getByRole("heading", { name: "Baixar conteúdo" })).toBeVisible();
});

test("mostra continuar a ver após abrir player", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Ver" }).first().click();
  await expect(page.getByRole("heading", { name: /A ver:/ })).toBeVisible();
  await page.waitForTimeout(6000);
  await page.keyboard.press("Escape");
  await expect(page.getByText("Continuar a ver")).toBeVisible();
  await expect(page.getByText("Ainda não há progresso guardado.")).toHaveCount(0);
});
