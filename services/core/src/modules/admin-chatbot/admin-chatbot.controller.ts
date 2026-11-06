import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Roles } from '../../shared/roles.guard.js';
import { AskChatbotDto } from './dto/ask-chatbot.dto.js';
import { AdminChatbotService } from './admin-chatbot.service.js';

@Controller()
export class AdminChatbotController {
  constructor(private readonly chatbot: AdminChatbotService) {}

  @Post('admin/chatbot/messages')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN')
  ask(@Body() body: AskChatbotDto) {
    return this.chatbot.ask(body.question);
  }
}
