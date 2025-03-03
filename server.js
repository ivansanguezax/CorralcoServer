require('dotenv').config();
const express = require('express');
const cors = require('cors');
const teamsRoutes = require('./routes/teams');
const campaignsRoutes = require('./routes/campaigns');
const reservationsRoutes = require('./routes/reservations');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas
app.use('/api/teams', teamsRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/reservations', reservationsRoutes);

// Middleware para manejar errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: 'Error del servidor: ' + err.message
  });
});

// Ruta para verificar que el servidor está funcionando
app.get('/', (req, res) => {
  res.send('Notion API está funcionando correctamente');
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});

module.exports = app;