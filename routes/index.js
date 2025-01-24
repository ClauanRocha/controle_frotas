const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

// Configurando o armazenamento do multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // Define o diretório onde os arquivos serão armazenados
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname)); // Define o nome do arquivo
    }
});

// Criando a constante upload usando a configuração do storage
const upload = multer({ storage: storage });

module.exports = (db) => {

    // Rota para a página de login
    router.get('/login', (req, res) => {
        res.render('login', { title: 'Login - Frotas de Caminhão' });
    });

    // Rota para processar o login
    router.post('/frota', (req, res) => {
        const { username, password } = req.body;

        const query = 'SELECT * FROM users WHERE username = ? AND password = ?';
        
        db.query(query, [username, password], (err, results) => {
            if (err) {
                console.error('Erro ao consultar o banco de dados:', err);
                res.send('Erro no servidor. Tente novamente mais tarde.');
            } else if (results.length > 0) {
                const user = results[0];
                req.session.user = user; // Salva o usuário na sessão

                if (user.role === 'admin') {
                    res.redirect('/frota');
                } else {
                    res.redirect('/home'); // Redireciona para a tela inicial do usuário comum
                }
            } else {
                res.send('Usuário ou senha incorretos.');
            }
        });
    });

    // Rota para a tela inicial do usuário comum
    router.get('/home', (req, res) => {
        if (!req.session.user) {
            return res.redirect('/login'); // Redirecionar para login se não estiver logado
        }

        // Consulta SQL para pegar os últimos 5 check-ins do banco de dados
        const query = `
            SELECT checkin_date, km, status
            FROM check_ins
            WHERE user_id = ?
            ORDER BY checkin_date DESC
            LIMIT 5
        `;
        db.query(query, [req.session.user.id], (err, checkins) => {
            if (err) {
                console.error('Erro ao consultar check-ins:', err);
                return res.status(500).send('Erro no servidor. Tente novamente mais tarde.');
            }

            // Soma os valores de km
            const totalKm = checkins.reduce((sum, checkin) => sum + (checkin.km || 0), 0);

            // Renderiza o template EJS passando as variáveis
            res.render('home', {
                user: req.session.user,
                checkins: checkins,
                totalKm: totalKm
            });
        });
    });

    // Rota para a página de administração de frota (Admin)
    router.get('/frota', (req, res) => {
        if (!req.session.user) {
            return res.redirect('/login');
        }

        // Se o usuário não for admin, redireciona para /home
        if (req.session.user.role !== 'admin') {
            return res.redirect('/home');
        }

        // Consulta SQL para obter o total de registros de check-outs
        const countQuery = 'SELECT COUNT(*) AS total_checkouts FROM check_outs';
        db.query(countQuery, (err, results) => {
            if (err) {
                console.error('Erro ao consultar o total de check-outs:', err);
                return res.status(500).send('Erro no servidor. Tente novamente mais tarde.');
            }

            const totalCheckouts = results[0].total_checkouts || 0;

            // Renderiza o template EJS passando as variáveis
            res.render('frota', {
                user: req.session.user,
                totalCheckouts: totalCheckouts
            });
        });
    });

    // Rota para obter o total de registros de check-outs via AJAX
    router.get('/checkouts-count', (req, res) => {
        if (!req.session.user) {
            return res.redirect('/login'); // Redirecionar para login se não estiver logado
        }

        // Consulta SQL para contar o número total de check-outs
        const query = 'SELECT COUNT(*) AS total_checkouts FROM check_outs';
        db.query(query, (err, results) => {
            if (err) {
                console.error('Erro ao consultar total de check-outs:', err);
                return res.status(500).send('Erro no servidor. Tente novamente mais tarde.');
            }

            const totalCheckouts = results[0].total_checkouts || 0;

            // Envia o total de check-outs para o frontend
            res.json({ totalCheckouts });
        });
    });

    // Rota para logout
    router.get('/logout', (req, res) => {
        req.session.destroy((err) => {
            if (err) {
                console.error('Erro ao encerrar a sessão:', err);
            }
            res.redirect('/login');
        });
    });

    // Rota para a página de perfil
    router.get('/perfil', (req, res) => {
        if (!req.session.user) {
            return res.redirect('/login'); // Redirecionar para login se não estiver logado
        }

        res.render('perfil', { user: req.session.user });
    });

    // Rota para atualização do perfil
    router.post('/perfil', (req, res) => {
        const { username, dtnasc, numcnh, password } = req.body;
        const userId = req.session.user.id;

        let updateQuery = 'UPDATE users SET username = ?, dtnasc = ?, numcnh = ?';
        let params = [username, dtnasc, numcnh];

        if (password) {
            updateQuery += ', password = ?';
            params.push(password); // Certifique-se de hashear a senha antes de armazená-la
        }

        updateQuery += ' WHERE id = ?';
        params.push(userId);

        db.query(updateQuery, params, (err, results) => {
            if (err) {
                console.error('Erro ao atualizar o perfil:', err);
                res.send('Erro no servidor. Tente novamente mais tarde.');
            } else {
                // Atualiza os dados do usuário na sessão
                req.session.user.username = username;
                req.session.user.dtnasc = dtnasc;
                req.session.user.numcnh = numcnh;

                res.redirect('/home'); // Redireciona para a página inicial após a atualização
            }
        });
    });

    // Rota para processar o check-in
    router.post('/checkin', (req, res) => {
        // Verifica se a sessão do usuário está definida
        if (!req.session.user || !req.session.user.id) {
            return res.status(401).send('Usuário não autenticado.');
        }

        const { vehicle, km, date, pneu_est, placa_enga, oleo_est, lataria_est, extintor_est, luz_est, destino, observacao } = req.body;
        const userId = req.session.user.id;

        const checkinQuery = 'INSERT INTO check_ins (user_id, vehicle, km, checkin_date, pneu_est, status, placa_enga, oleo_est, lataria_est, extintor_est, luz_est, destino, observacao) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)';

        db.query(checkinQuery, [userId, vehicle, km, date, pneu_est, placa_enga, oleo_est, lataria_est, extintor_est, luz_est, destino, observacao], (err, results) => {
            if (err) {
                console.error('Erro ao registrar o check-in:', err);
                return res.status(500).send('Erro no servidor. Tente novamente mais tarde.');
            }

            console.log('Check-in registrado com sucesso:', results);

            res.redirect('/checkin-success'); // Redireciona para a página de sucesso após o check-in
        });
    });

    // Rota para processar o check-out
    router.post('/checkout', (req, res) => {
        console.log('Dados recebidos para checkout:', req.body);
    
        if (!req.session.user || !req.session.user.id) {
            return res.status(401).send('Usuário não autenticado.');
        }
    
        const { vehicle, km, date, pneu_est, placa_eng, oleo_est, lataria_est, extintor_est, luz_est, destino, observacao } = req.body; 
        const userId = req.session.user.id;
    
        console.log('Dados recebidos para check-out:', { vehicle, km, date, pneu_est });
    
        const checkoutQuery = 'INSERT INTO check_outs (user_id, vehicle, km, checkout_date, pneu_est, placa_eng, oleo_est, lataria_est, extintor_est, luz_est, destino, observacao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    
        db.query(checkoutQuery, [userId, vehicle, km, date, pneu_est, placa_eng, oleo_est, lataria_est, extintor_est, luz_est, destino, observacao], (err, results) => {
            if (err) {
                console.error('Erro ao registrar o check-out:', err);
                return res.status(500).send('Erro no servidor. Tente novamente mais tarde.');
            }
    
            console.log('Check-out registrado com sucesso:', results);
            res.redirect('/checkin-success');
        });
    });
    
    // Rota para a tela de sucesso do check-in
    router.get('/checkin-success', (req, res) => {
        res.render('checkin-success', { title: 'Check-in Realizado com Sucesso!' });
    });

    // Rota para a tela de sucesso do check-out
    router.get('/checkout-success', (req, res) => {
        res.render('checkout-success', { title: 'Check-out Realizado com Sucesso!' });
    });

    // Rota para a página de veículos na frota
    router.get('/frota/veiculos', (req, res) => {
        if (!req.session.user) {
            return res.redirect('/login'); // Redireciona para login se o usuário não estiver logado
        }
    
        // Consulta para obter os veículos cadastrados
        const query = 'SELECT * FROM veiculos';
        db.query(query, (err, results) => {
            if (err) {
                console.error('Erro ao consultar veículos:', err);
                res.send('Erro no servidor. Tente novamente mais tarde.');
            } else {
                res.render('veiculos', { user: req.session.user, veiculos: results });
            }
        });
    });

    // Rota para cadastrar novos veículos
    router.post('/frota/veiculos', (req, res) => {
        const { modelo, placa, ano, cor } = req.body;
    
        const query = 'INSERT INTO veiculos (modelo, placa, ano, cor) VALUES (?, ?, ?, ?)';
        db.query(query, [modelo, placa, ano, cor], (err, results) => {
            if (err) {
                console.error('Erro ao cadastrar veículo:', err);
                res.send('Erro no servidor. Tente novamente mais tarde.');
            } else {
                res.redirect('/frota/veiculos'); // Redireciona para a lista de veículos após o cadastro
            }
        });
    });

    router.get('/checkin', (req, res) => {
        res.render('checkin', { title: 'Check-in' });
    });
    
    router.get('/checkout', (req, res) => {
        res.render('checkout', { title: 'Check-out' });
    });
    
    // Rota para a página de motoristas na frota
    router.get('/frota/motoristas', (req, res) => {
        if (!req.session.user) {
            return res.redirect('/login'); // Redireciona para login se o usuário não estiver logado
        }

        // Consulta para obter os motoristas cadastrados
        const query = 'SELECT * FROM motoristas';
        db.query(query, (err, results) => {
            if (err) {
                console.error('Erro ao consultar motoristas:', err);
                res.send('Erro no servidor. Tente novamente mais tarde.');
            } else {
                res.render('motoristas', { user: req.session.user, motoristas: results });
            }
        });
    });

    // Rota para cadastrar novos motoristas
    router.post('/motoristas', (req, res) => {
        const {
            moto_nome,
            moto_tel,
            moto_nasc,
            moto_cnh,
            moto_antcri,
            moto_ear,
            moto_traj
        } = req.body;

        const query = `
            INSERT INTO motoristas (moto_nome, moto_tel, moto_nasc, moto_cnh, moto_antcri, moto_ear, moto_traj)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        db.query(query, [moto_nome, moto_tel, moto_nasc, moto_cnh, moto_antcri, moto_ear, moto_traj], (err, results) => {
            if (err) {
                console.error('Erro ao cadastrar motorista:', err);
                res.send('Erro no servidor. Tente novamente mais tarde.');
            } else {
                res.redirect('/motoristas'); // Redireciona para a lista de motoristas após o cadastro
            }
        });
    });

    // Rota para processar o abastecimento
    router.post('/abastecimento', upload.single('cupom_foto'), (req, res) => {
        if (!req.session.user) {
            return res.redirect('/login');
        }

        const { veiculo, odometro, posto_combustivel, valor_litro, quantidade_litros, numero_cupom } = req.body;
        const userId = req.session.user.id;
        const cupomFoto = req.file ? req.file.filename : null; // Nome do arquivo salvo

        const abastecimentoQuery = `
            INSERT INTO abastecimento (user_id, veiculo, odometro, posto_combustivel, valor_litro, quantidade_litros, numero_cupom, cupom_foto)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.query(abastecimentoQuery, [userId, veiculo, odometro, posto_combustivel, valor_litro, quantidade_litros, numero_cupom, cupomFoto], (err, results) => {
            if (err) {
                console.error('Erro ao registrar abastecimento:', err);
                return res.status(500).send('Erro no servidor. Tente novamente mais tarde.');
            }

            res.redirect('/checkin-success');
        });
    });

    // Rota para a página de abastecimento
    router.get('/abastecimento', (req, res) => {
        if (!req.session.user) {
            return res.redirect('/login');
        }

        // Aqui você deve buscar os veículos no banco de dados
        const query = 'SELECT id, placa, modelo FROM veiculos';

        db.query(query, (err, veiculos) => {
            if (err) {
                console.error('Erro ao buscar veículos:', err);
                return res.status(500).send('Erro no servidor.');
            }

            // Renderize a página passando a lista de veículos
            res.render('abastecimento', { 
                title: 'Abastecimento - Frotas de Caminhão', 
                veiculos: veiculos // Passe os veículos aqui
            });
        });
    }); 

    // Rota de sucesso para abastecimento
    router.get('/abastecimento-success', (req, res) => {
        res.render('registro-sucesso', { 
            titulo: 'Abastecimento Realizado com Sucesso', 
            mensagem: 'O seu registro de abastecimento foi efetuado com sucesso.'
        });
    });

    // Rota de sucesso para check-in
    router.get('/checkin-success', (req, res) => {
        res.render('registro-sucesso', { 
            titulo: 'Check-in Realizado com Sucesso', 
            mensagem: 'O seu check-in foi efetuado com sucesso.'
        });
    });

    // Rota de sucesso para checkout
    router.get('/checkout-success', (req, res) => {
        res.render('registro-sucesso', { 
            titulo: 'Checkout Realizado com Sucesso', 
            mensagem: 'O seu checkout foi efetuado com sucesso.'
        });
    });

    // Rota para editar informações de um veículo
    router.post('/frota/veiculos/editar/:id', (req, res) => {
        const { id } = req.params;
        const { modelo, placa, ano, cor } = req.body;

        const query = 'UPDATE veiculos SET modelo = ?, placa = ?, ano = ?, cor = ? WHERE id = ?';
        
        db.query(query, [modelo, placa, ano, cor, id], (err, results) => {
            if (err) {
                console.error('Erro ao atualizar o veículo:', err);
                res.status(500).send('Erro no servidor ao atualizar o veículo. Tente novamente mais tarde.');
            } else {
                res.redirect('/frota/veiculos'); // Redireciona para a lista de veículos após a edição
            }
        });
    });

    // Rota para excluir um veículo
    router.post('/frota/veiculos/excluir/:id', (req, res) => {
        const { id } = req.params;

        const query = 'DELETE FROM veiculos WHERE id = ?';

        db.query(query, [id], (err, results) => {
            if (err) {
                console.error('Erro ao excluir o veículo:', err);
                res.status(500).send('Erro no servidor ao excluir o veículo. Tente novamente mais tarde.');
            } else {
                res.redirect('/frota/veiculos'); // Redireciona para a lista de veículos após a exclusão
            }
        });
    });

    return router;
};
