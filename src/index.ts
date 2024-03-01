import { plainToClass } from "class-transformer";
import { validateOrReject } from "class-validator";
import dotenv from "dotenv";
import "es6-shim";
import express, { Express, Request, Response } from "express";
import { Pool } from "pg";
import "reflect-metadata";
import { Board } from "./dto/board.dto";
import { User } from "./dto/user.dto";
import { List } from "./dto/list.dto";
import { Card } from "./dto/card.dto";
import { CardUser } from "./dto/cardUser.dto";

dotenv.config();


// Conexion a la base de datos
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: +process.env.DB_PORT!,
});


// Iniciar el servidor
const app: Express = express();
const port = process.env.PORT || 3000;
app.use(express.json());


// Obtener Usuarios
app.get("/users", async (req: Request, res: Response) => {
  try {

    const text = "SELECT id, name, email FROM users";
    const result = await pool.query(text);
    res.status(200).json(result.rows);

  } catch (errors) {
    return res.status(400).json(errors);
  }
});

// Crear usuario
app.post("/users", async (req: Request, res: Response) => {
  let userDto: User = plainToClass(User, req.body);
  try {

    await validateOrReject(userDto);

    const text = "INSERT INTO users(name, email) VALUES($1, $2) RETURNING *";
    const values = [userDto.name, userDto.email];
    const result = await pool.query(text, values);
    res.status(201).json(result.rows[0]);

  } catch (errors) {
    return res.status(422).json(errors);
  }
});

// Obtener tablas
app.get("/boards", async (req: Request, res: Response) => {
  try {

    const text = 'SELECT b.id, b.name, bu.userId "adminUserId" FROM boards b JOIN board_users bu ON bu.boardId = b.id WHERE bu.isAdmin IS true';
    const result = await pool.query(text);
    res.status(200).json(result.rows);

  } catch (errors) {
    return res.status(400).json(errors);
  }
});

// Crear tabla
app.post("/boards", async (req: Request, res: Response) => {
  let boardDto: Board = plainToClass(Board, req.body);
  const client = await pool.connect();

  try {

    client.query("BEGIN");
    await validateOrReject(boardDto, {});

    const boardText = "INSERT INTO boards(name) VALUES($1) RETURNING *";
    const boardValues = [boardDto.name];
    const boardResult = await client.query(boardText, boardValues);

    const boardUserText = "INSERT INTO board_users(boardId, userId, isAdmin) VALUES($1, $2, $3)";
    const boardUserValues = [
      boardResult.rows[0].id,
      boardDto.adminUserId,
      true,
    ];

    await client.query(boardUserText, boardUserValues);

    client.query("COMMIT");
    res.status(201).json(boardResult.rows[0]);

  } catch (errors) {
    client.query("ROLLBACK");
    return res.status(422).json(errors);
  } finally {
    client.release();
  }
});

// Obtener listas de una tabla en especifico
app.get("/boards/:boardId/lists", async (req: Request, res: Response) => {
  try {
    const boardId = req.params.boardId;
    const text = "SELECT * FROM lists WHERE boardId = $1";
    const result = await pool.query(text, [boardId]);
    res.status(200).json(result.rows);
  } catch (errors) {
    return res.status(400).json(errors);
  }
});

// Crear lista en una tabla especifica
app.post("/boards/:boardId/lists", async (req: Request, res: Response) => {
  let listDto: List = plainToClass(List, req.body);
  listDto.boardId = req.params.boardId;

  try {

    await validateOrReject(listDto);

    const text = "INSERT INTO lists(name, boardId) VALUES($1, $2) RETURNING *";
    const values = [listDto.name, listDto.boardId];
    const result = await pool.query(text, values);
    res.status(201).json(result.rows[0]);

  } catch (errors) {
    return res.status(422).json(errors);
  }
});

// Obtener tarjetas de una lista en especifico
app.get("/lists/:listId/cards", async (req: Request, res: Response) => {
  try {

    const listId = req.params.listId;
    const text = "SELECT * FROM cards WHERE listId = $1";
    const result = await pool.query(text, [listId]);
    res.status(200).json(result.rows);

  } catch (errors) {
    return res.status(400).json(errors);
  }
});

// Crear tarjeta en una lista especifica
app.post("/lists/:listId/cards", async (req: Request, res: Response) => {
  let cardDto: Card = plainToClass(Card, req.body);
  cardDto.listId = req.params.listId;

  try {

    await validateOrReject(cardDto);

    const cardText = "INSERT INTO cards(title, description, due_date, listId) VALUES($1, $2, $3, $4) RETURNING *";
    const cardValues = [cardDto.title, cardDto.description, cardDto.due_date, cardDto.listId];
    const cardResult = await pool.query(cardText, cardValues);

    res.status(201).json(cardResult.rows[0]);

  } catch (errors) {
    return res.status(422).json(errors);
  }
});

// Obtener el usuario de una tarjeta
app.get("/cards/:cardId/users", async (req: Request, res: Response) => {
  try {

    const cardId = req.params.cardId;
    const text = `SELECT c.id AS card_id, u.* FROM cards c JOIN card_users cu ON c.id = cu.cardId JOIN users u ON cu.userId = u.id WHERE c.id = $1 AND cu.isOwner = true`;
    const result = await pool.query(text, [cardId]);

    if (result.rows.length > 0) {
      res.status(200).json(result.rows[0]);
    } else {
      res.status(404).json({ message: "No se encontró el usuario dueño de la tarjeta." });
    }

  } catch (errors) {
    return res.status(400).json(errors);
  }
});

// Agregar usuario a una tarjeta
app.post("/cards/:cardId/users/:userId", async (req: Request, res: Response) => {
  let cardUserDto: CardUser = plainToClass(CardUser, req.body);
  cardUserDto.cardId = req.params.cardId;
  cardUserDto.userId = req.params.userId;

  try {

    await validateOrReject(cardUserDto);

    const cardUserText = "INSERT INTO card_users(isOwner, cardId, userId) VALUES($1, $2, $3) RETURNING *";
    const cardUserValues = [true, cardUserDto.cardId, cardUserDto.userId];
    const cardUserResult = await pool.query(cardUserText, cardUserValues);

    res.status(201).json(cardUserResult.rows[0]);

  } catch (errors) {
    return res.status(422).json(errors);
  }
});


app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});
