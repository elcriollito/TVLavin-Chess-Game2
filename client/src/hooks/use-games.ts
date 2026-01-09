import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { InsertGame } from "@shared/schema";

export function useGames() {
  return useQuery({
    queryKey: [api.games.list.path],
    queryFn: async () => {
      const res = await fetch(api.games.list.path);
      if (!res.ok) throw new Error("Failed to fetch games");
      return api.games.list.responses[200].parse(await res.json());
    },
  });
}

export function useGame(id: number) {
  return useQuery({
    queryKey: [api.games.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.games.get.path, { id });
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch game");
      return api.games.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreateGame() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (game: InsertGame) => {
      const res = await fetch(api.games.create.path, {
        method: api.games.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(game),
      });

      if (!res.ok) {
        if (res.status === 400) {
          throw new Error("Invalid game data");
        }
        throw new Error("Failed to create game");
      }
      return api.games.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.games.list.path] });
    },
  });
}
