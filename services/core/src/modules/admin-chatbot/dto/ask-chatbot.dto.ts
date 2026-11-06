import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

/** Request body for `POST /admin/chatbot/messages`. */
export class AskChatbotDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 1000)
  question: string;
}
