import { Module } from '@nestjs/common';
import { AdminChatbotController } from './admin-chatbot.controller.js';
import { AdminChatbotService } from './admin-chatbot.service.js';

@Module({
  controllers: [AdminChatbotController],
  providers: [AdminChatbotService],
})
export class AdminChatbotModule {}
