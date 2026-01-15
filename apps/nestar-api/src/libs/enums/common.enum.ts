import { registerEnumType } from '@nestjs/graphql';

export enum Message {
  SOMETHING_WENT_WRONG = 'Something went wrong!',
  NO_DATA_FOUND = 'No data found!',
  CREATE_FAILED = 'Creation failed!',
  UPDATE_FAILED = 'Update failed!',
  REMOVE_FAILED = 'Removal failed!',
  UPLOAD_FAILED = 'Upload failed!',
  BAD_REQUEST = 'Bad request!',

  USED_MEMBER_NICK_OR_PHONE = 'Already used member nick or phone',
  NO_MEMBER_NICK = 'No member with that nickname exists!',
  BLOCKED_USER = 'You have been blocked!',
  WRONG_PASSWORD = 'The password is incorrect! Try again.',
  NOT_AUTHENTICATED = 'You are not authenticated! Please log in.',
  TOKEN_NOT_EXIST = 'Bearer Token is not provided!',
  ONLY_SPECIFIC_ROLES_ALLOWED = 'Allowed only for members with specific roles!',
  NOT_ALLOWED_REQUEST = 'Not Allowed Request!',
  PROVIDE_ALLOWED_FORMAT = 'Please provide jpg, jpeg or png format images!',
  SELF_SUBSCRIPTION_DENIED = 'Self subscription is denied!',
  ALREADY_SUBSCRIBED = 'You have already subscribed to this member!',
}

export enum Direction {
  ASC = 1,
  DESC = -1,
}
registerEnumType(Direction, { name: 'Direction' });
