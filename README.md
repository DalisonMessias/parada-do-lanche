
# Parada do Lanche - Cardápio Digital Colaborativo

O **Parada do Lanche** é uma solução moderna de autoatendimento para restaurantes, focada na experiência coletiva e eficiência operacional.

## Funcionalidades Principais

### Para Clientes (Mobile)
- **Acesso via QR Code**: Identificação automática de mesa.
- **Identificação Social**: Entrada com nome ou apelido.
- **Carrinho Compartilhado**: Vários clientes na mesma mesa podem adicionar itens ao mesmo pedido em tempo real.
- **Sistema de Host**: O primeiro cliente a abrir a mesa tem o poder de "Enviar para a Cozinha", garantindo ordem no pedido do grupo.
- **Categorização Inteligente**: Navegação rápida entre categorias de produtos.

### Para Administração (Desktop)
- **Monitor de Pedidos**: Gestão de fluxo de produção (Pendente -> Preparando -> Pronto -> Finalizado).
- **Gestão de Mesas**:
    - Criação e exclusão de mesas.
    - Geração de QR Codes profissionais.
    - Impressão em lote (etiquetas minimalistas 10x10cm).
- **Gestão de Cardápio**: Cadastro de categorias e produtos com fotos e descrições.
- **Branding da Loja**: Customização de cores e logotipo oficial.
- **Gestão de Equipe**: Controle de usuários com diferentes níveis de acesso (Admin, Manager, Waiter).

## Tecnologias Utilizadas
- **Frontend**: React.js com Tailwind CSS.
- **Backend/Banco de Dados**: Supabase (PostgreSQL + Auth + Storage).
- **QR Codes**: API dinâmica para geração de códigos de acesso.

## Como funciona
1. O restaurante imprime as etiquetas de mesa e as cola nos locais de atendimento.
2. O cliente escaneia, escolhe seus produtos e monta o carrinho com seus amigos.
3. O "Host" da mesa confirma o pedido.
4. A cozinha recebe o alerta instantaneamente no painel administrativo.
5. O garçom entrega o pedido e finaliza a mesa no sistema, liberando-a para o próximo cliente.
