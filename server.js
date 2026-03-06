const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
require('dotenv').config();

const app = express();
// 适配本地和部署环境的端口
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
// 核心：正确托管public文件夹的静态资源，__dirname确保路径绝对正确
app.use(express.static(path.join(__dirname, 'public')));

// 通义千问API配置
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
const MODEL_NAME = 'qwen-turbo';

// 根路径兜底：防止静态托管失效，直接返回index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// AI聊天接口
app.post('/api/ai-chat', async (req, res) => {
  try {
    const { messages } = req.body;
    if(!messages || !Array.isArray(messages)){
      return res.status(400).json({ error: '消息格式错误' });
    }

    // 消息清洗校验
    const systemMessage = messages.find(msg => msg.role === 'system');
    const systemPrompt = systemMessage ? systemMessage.content : '';

    let cleanedMessages = messages
      .filter(msg => msg.role === 'user' || msg.role === 'assistant')
      .map(msg => ({
        role: msg.role,
        content: String(msg.content || '').trim()
      }))
      .filter(msg => msg.content);

    const validatedMessages = [];
    let lastRole = null;
    for (const msg of cleanedMessages) {
      if (msg.role === lastRole) continue;
      validatedMessages.push(msg);
      lastRole = msg.role;
    }

    if (validatedMessages.length > 0 && validatedMessages[validatedMessages.length - 1].role !== 'user') {
      validatedMessages.pop();
    }

    if (systemPrompt && validatedMessages.length > 0 && validatedMessages[0].role === 'user') {
      validatedMessages[0].content = `${systemPrompt}\n\n用户问题：${validatedMessages[0].content}`;
    }

    if (validatedMessages.length === 0) {
      return res.status(400).json({ error: '没有有效的用户消息' });
    }

    // 调用通义千问API
    const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
        'Content-Type': 'application/json',
        'X-DashScope-SSE': 'disable'
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        input: { messages: validatedMessages },
        parameters: {
          result_format: 'message',
          temperature: 0.7,
          top_p: 0.8,
          max_tokens: 1000
        }
      })
    });

    const data = await response.json();
    if(!response.ok){
      console.error('通义千问API报错：', data);
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (error) {
    console.error('接口调用失败', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 404兜底
app.use('*', (req, res) => {
  res.status(404).send('页面不存在，请检查路径');
});

// 启动服务
app.listen(PORT, () => {
  console.log(`✅ 服务已成功启动！`);
  console.log(`🌐 本地访问地址：http://localhost:${PORT}`);
});