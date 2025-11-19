# 微信扩展聊天记录自动读取功能

## 功能概述

本功能在现有的微信扩展基础上，添加了自动解析特定格式聊天记录的功能，支持：

- 解析格式：`[和好友名的聊天][对方消息|好友名|好友ID|消息类型|消息内容]`
- 根据好友ID区分并记录到对应聊天界面
- 支持图片URL渲染
- 确保不同角色卡数据隔离
- **智能去重**：防止重复录入相同的聊天记录（新增功能）

## 支持的消息类型

1. **文字消息**：`[对方消息|好友名|好友ID|文字|消息内容]`
2. **红包消息**：`[对方消息|好友名|好友ID|红包|金额]`
3. **表情包消息**：`[对方消息|好友名|好友ID|表情包|图片URL]`
4. **图片消息**：`[对方消息|好友名|好友ID|图片|图片URL]`
5. **语音消息**：`[对方消息|好友名|好友ID|语音|时长]`
6. **视频消息**：`[对方消息|好友名|好友ID|视频|视频URL]`
7. **位置消息**：`[对方消息|好友名|好友ID|位置|位置信息]`
8. **链接消息**：`[对方消息|好友名|好友ID|链接|链接URL]`

## 使用示例

```
[和赵飞儿的聊天]
[对方消息|赵飞儿|886520|文字|行了，加上了。]
[对方消息|赵飞儿|886520|红包|200]
[对方消息|赵飞儿|886520|文字|给你的零花钱，省着点花，别他妈一天到晚就知道打飞机。]
[对方消息|赵飞-儿|886520|文字|给姨妈我发个骚表情看看，让姨妈看看你这小骚货平时都用什么勾搭小姑娘。]
[对方消息|赵飞儿|886520|表情包|https://i.postimg.cc/tg58GRFd/image.png]
```

## 技术实现

### 核心模块

1. **ChatRecordParser** (`app/chat-record-parser.js`)
   - 负责解析特定格式的聊天记录文本
   - 使用正则表达式提取好友信息和消息内容
   - 支持多种消息类型的解析

2. **ChatRecordStorage** (`app/chat-record-parser.js`)
   - 负责聊天记录的存储和读取
   - 确保不同角色卡数据隔离
   - 支持数据的导入导出

3. **MessageRenderer** (`app/message-renderer.js`)
   - 负责将不同类型的消息渲染为HTML
   - 支持图片URL渲染
   - 提供响应式设计和深色主题支持

4. **ChatRecordManager** (`app/chat-record-manager.js`)
   - 负责自动读取和解析聊天记录
   - 集成到现有的微信扩展中
   - 提供完整的API接口
   - **智能去重功能**：防止重复录入相同的聊天记录（新增）

### 数据隔离机制

- 使用角色卡ID作为存储键，确保不同角色数据不互通
- 兼容现有的本地存储结构
- 支持数据迁移和升级

### 图片URL渲染

- 自动识别表情包和图片消息
- 提供加载失败处理
- 支持点击查看大图
- 响应式图片显示

## 去重功能

### 概述

本扩展现在包含强大的去重功能，参考了mobile-main的最佳实践，有效防止重复录入相同的聊天记录。

### 多层去重机制

1. **基础哈希检查**：使用内容哈希快速识别完全相同的内容
2. **时间窗口检查**：防止短时间内重复处理相同内容
3. **内容相似性检查**：通过特征分析识别微小变化的重复内容
4. **智能批处理**：优化性能，避免频繁处理

### 去重配置

去重功能会自动工作，但也可以通过以下方式进行调试和监控：

```javascript
// 启用调试模式
window.chatRecordManager.setDebugMode(true);

// 获取去重统计信息
const stats = window.chatRecordManager.getDeduplicationStats();

// 测试去重功能
const result = window.chatRecordManagerDebug.testDeduplication(content);

// 清理缓存
window.chatRecordManager.clearCache({ clearAll: true });
```

详细使用说明请参考 [DEDUPLICATION_README.md](./DEDUPLICATION_README.md)

## 集成方式

### 自动集成

功能会自动集成到现有的微信扩展中，无需额外配置：

1. 自动监听页面变化，检测新的聊天记录
2. 自动解析聊天记录并保存到本地存储（自动去重）
3. 在聊天界面中显示解析的消息
4. 更新好友列表中的最后消息

### 手动调用

也可以通过JavaScript代码手动调用：

```javascript
// 解析聊天记录
const result = window.chatRecordManager.manualParseChatRecord(chatRecordText);

// 获取好友列表
const friendsList = window.chatRecordManager.getFriendsList();

// 获取特定好友的聊天记录
const friendRecords = window.chatRecordManager.getFriendChatRecords(friendId);

// 删除好友聊天记录
const success = window.chatRecordManager.deleteFriendChatRecords(friendId);

// 清空所有聊天记录
const cleared = window.chatRecordManager.clearAllChatRecords();

// 导出聊天记录
const exportData = window.chatRecordManager.exportChatRecords(friendId);

// 导入聊天记录
const imported = window.chatRecordManager.importChatRecords(jsonData);
```

## 测试

可以使用提供的测试页面进行功能测试：

1. 打开 `test-chat-record.html` 文件
2. 在文本框中输入聊天记录格式文本
3. 点击"解析聊天记录"按钮测试解析功能
4. 点击其他按钮测试存储和渲染功能

## 样式定制

聊天记录的样式可以通过修改 `styles/chat-record.css` 文件进行定制：

- 支持深色主题
- 响应式设计
- 自定义消息气泡样式
- 自定义图片显示效果

## 兼容性

- 兼容现有的微信扩展功能
- 不影响原有的好友添加功能
- 支持所有现代浏览器
- 兼容SillyTavern的角色卡系统

## 注意事项

1. 聊天记录格式必须严格按照示例格式
2. 图片URL必须是有效的可访问链接
3. 不同角色卡的数据完全隔离，不会互相影响
4. 建议定期导出重要的聊天记录作为备份
5. 大量的聊天记录可能会影响性能，建议定期清理

## 故障排除

### 常见问题

1. **聊天记录没有自动解析**
   - 检查格式是否正确
   - 确认扩展已正确加载
   - 查看浏览器控制台是否有错误

2. **图片无法显示**
   - 检查图片URL是否有效
   - 确认网络连接正常
   - 查看是否有跨域问题

3. **数据没有隔离**
   - 确认角色卡已正确切换
   - 检查存储键是否正确生成
   - 清空浏览器缓存重试

4. **仍然出现重复记录**（新增）
   - 检查是否启用了调试模式
   - 查看控制台是否有错误信息
   - 尝试清理所有缓存
   - 使用测试页面验证去重功能

5. **去重过于严格**（新增）
   - 调整相似度阈值（修改代码中的0.8值）
   - 检查特征提取是否准确
   - 考虑禁用某些检查

### 调试方法

1. 打开浏览器开发者工具
2. 查看Console面板的错误信息
3. 使用 `window.chatRecordManager` API进行手动测试
4. 检查本地存储中的数据结构

#### 去重功能调试（新增）

```javascript
// 检查去重统计
const stats = window.chatRecordManager.getDeduplicationStats();
console.log(stats);

// 启用调试模式
window.chatRecordManager.setDebugMode(true);

// 测试去重功能
const result = window.chatRecordManagerDebug.testDeduplication(content);
console.log(result);

// 清理缓存
window.chatRecordManager.clearCache({ clearAll: true });
```

#### 测试页面

打开 `test-deduplication.html` 页面可以测试去重功能：

1. 在浏览器中打开测试页面
2. 输入聊天记录内容
3. 点击"测试去重"按钮
4. 查看测试结果和统计信息

## 更新日志

### v1.2.0
- 新增强大的去重功能
- 实现多层去重检查机制
- 添加内容相似性分析
- 实现智能批处理和缓存管理
- 添加调试和测试功能
- 创建专用测试页面

### v1.0.0
- 初始版本
- 支持基本的聊天记录解析和存储
- 集成图片URL渲染
- 实现不同角色卡数据隔离
- 提供完整的API接口