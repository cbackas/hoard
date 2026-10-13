import { Hono } from "hono";
import { Hello, Home } from "../views/Home.tsx";

export const router = new Hono();

router.get("/", (c) => c.html(<Home />));
router.get("/hello", (c) => c.html(<Hello at={new Date()} />));
